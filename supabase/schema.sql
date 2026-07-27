-- Home à la Carte hosted storage, account lifecycle, and retention policy.
--
-- Run this file as the project owner in the Supabase SQL editor. The browser
-- receives only a publishable key. Row-level security restricts records to the
-- authenticated account that owns them.

create table if not exists public.household_state (
    user_id uuid primary key references auth.users(id) on delete cascade,
    payload jsonb not null,
    revision bigint not null default 1 check (revision > 0),
    updated_at timestamptz not null default now()
);

create table if not exists public.account_lifecycle (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    last_active_at timestamptz not null default now(),
    privacy_accepted_at timestamptz,
    health_data_consent boolean not null default false,
    authority_confirmed boolean not null default false
);

-- Apply the current lifecycle model when this file is rerun on an earlier
-- installation. Consent is recorded without referring to a separate,
-- versioned notice, and user-requested deletion is immediate.
alter table public.account_lifecycle
drop column if exists deletion_requested_at cascade;

alter table public.account_lifecycle
drop column if exists privacy_notice_version;

-- Private messages sent from My data. They remain tied to the account and are
-- erased with it. Only the authenticated requester can read their own rows;
-- the project owner processes them privately from the Supabase dashboard.
create table if not exists public.privacy_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    request_type text not null check (
        request_type in (
            'access',
            'rectification',
            'erasure',
            'restriction',
            'objection',
            'portability',
            'other'
        )
    ),
    message text not null check (
        char_length(message) between 10 and 4000
    ),
    status text not null default 'received' check (
        status in ('received', 'in_progress', 'completed', 'rejected')
    ),
    response_message text check (
        response_message is null
        or char_length(response_message) between 1 and 4000
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz
);

alter table public.privacy_requests
add column if not exists response_message text;

create index if not exists privacy_requests_owner_created_idx
on public.privacy_requests (user_id, created_at desc);

-- Existing users are deliberately treated as active at migration time. Their
-- consent fields stay empty until consent has actually been recorded.
insert into public.account_lifecycle (user_id, created_at, last_active_at)
select id, now(), now()
from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_homealacarte_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.account_lifecycle (
        user_id,
        privacy_accepted_at,
        health_data_consent,
        authority_confirmed
    )
    values (
        new.id,
        case
            when coalesce(new.raw_user_meta_data -> 'privacy_accepted', 'false'::jsonb) = 'true'::jsonb
            then now()
            else null
        end,
        coalesce(new.raw_user_meta_data -> 'health_data_consent', 'false'::jsonb) = 'true'::jsonb,
        coalesce(new.raw_user_meta_data -> 'authority_confirmed', 'false'::jsonb) = 'true'::jsonb
    )
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists homealacarte_user_created on auth.users;
create trigger homealacarte_user_created
after insert on auth.users
for each row execute function public.handle_homealacarte_user_created();

alter table public.household_state enable row level security;
alter table public.account_lifecycle enable row level security;
alter table public.privacy_requests enable row level security;

revoke all on table public.household_state from anon;
revoke all on table public.account_lifecycle from anon;
revoke all on table public.privacy_requests from anon;
revoke all on table public.account_lifecycle from authenticated;
revoke all on table public.privacy_requests from authenticated;
grant select, insert, update, delete on table public.household_state to authenticated;
grant select on table public.account_lifecycle to authenticated;
grant select on table public.privacy_requests to authenticated;

drop policy if exists "account_lifecycle_select_own" on public.account_lifecycle;
create policy "account_lifecycle_select_own"
on public.account_lifecycle
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "household_state_select_own" on public.household_state;
create policy "household_state_select_own"
on public.household_state
for select
to authenticated
using (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.account_lifecycle lifecycle
        where lifecycle.user_id = (select auth.uid())
    )
);

drop policy if exists "household_state_insert_own" on public.household_state;
create policy "household_state_insert_own"
on public.household_state
for insert
to authenticated
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.account_lifecycle lifecycle
        where lifecycle.user_id = (select auth.uid())
    )
);

drop policy if exists "household_state_update_own" on public.household_state;
create policy "household_state_update_own"
on public.household_state
for update
to authenticated
using (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.account_lifecycle lifecycle
        where lifecycle.user_id = (select auth.uid())
    )
)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.account_lifecycle lifecycle
        where lifecycle.user_id = (select auth.uid())
    )
);

drop policy if exists "household_state_delete_own" on public.household_state;
create policy "household_state_delete_own"
on public.household_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "privacy_requests_select_own" on public.privacy_requests;
create policy "privacy_requests_select_own"
on public.privacy_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Called when an authenticated browser successfully reaches the database.
-- This is the definition of account activity used by the retention job.
create or replace function public.touch_account_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'authentication required';
    end if;

    update public.account_lifecycle
    set last_active_at = now()
    where user_id = current_user_id;

    if not found then
        raise exception 'account not found';
    end if;
end;
$$;

revoke all on function public.touch_account_activity() from public;
grant execute on function public.touch_account_activity() to authenticated;

-- Authenticated users submit private requests without exposing an email
-- address. The account email is already verified by Supabase Authentication.
-- Direct table inserts remain forbidden, which prevents impersonating another
-- requester or setting the workflow status from the browser.
create or replace function public.submit_privacy_request(
    requested_type text,
    requested_message text
)
returns public.privacy_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
    created_request public.privacy_requests;
begin
    if current_user_id is null then
        raise exception 'authentication required';
    end if;

    insert into public.privacy_requests (
        user_id,
        request_type,
        message
    )
    values (
        current_user_id,
        requested_type,
        btrim(requested_message)
    )
    returning * into created_request;

    update public.account_lifecycle
    set last_active_at = now()
    where user_id = current_user_id;

    return created_request;
end;
$$;

revoke all on function public.submit_privacy_request(text, text) from public;
grant execute on function public.submit_privacy_request(text, text) to authenticated;

-- Delete the household document, private requests, lifecycle record, and Auth
-- account in one transaction. Immediate deletion avoids depending on a Cron
-- job that cannot run while a Supabase Free project is paused.
create or replace function public.request_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'authentication required';
    end if;

    delete from auth.users
    where id = current_user_id;

    return found;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- Removes:
--   * accounts with data after one year without app activity;
--   * empty accounts after one week without app activity.
--
-- Deleting auth.users cascades to all three public tables. This function is not
-- callable by browser roles; it is executed only by the database scheduler.
create or replace function public.purge_expired_homealacarte_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_count integer;
begin
    with expired as (
        select lifecycle.user_id
        from public.account_lifecycle lifecycle
        where lifecycle.last_active_at <= now() - interval '1 year'
        or (
            lifecycle.last_active_at <= now() - interval '1 week'
            and not exists (
                select 1
                from public.household_state state
                where state.user_id = lifecycle.user_id
            )
        )
    ),
    deleted as (
        delete from auth.users users
        using expired
        where users.id = expired.user_id
        returning users.id
    )
    select count(*)::integer into deleted_count from deleted;

    return deleted_count;
end;
$$;

revoke all on function public.purge_expired_homealacarte_accounts() from public;

-- Supabase Cron performs inactivity cleanup only while Postgres is running.
-- Free projects may pause for low activity, so this job is not an uninterrupted
-- retention guarantee. Expired accounts are caught up after the project resumes.
create extension if not exists pg_cron;

select cron.schedule(
    'homealacarte-retention-daily',
    '15 2 * * *',
    'select public.purge_expired_homealacarte_accounts()'
);

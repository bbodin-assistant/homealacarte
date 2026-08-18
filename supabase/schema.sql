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

-- Incremental household synchronization. JSON remains the import/export
-- envelope, while each editable domain record has its own versioned row.
create table if not exists public.household_records (
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_type text not null check (
        entity_type in ('app', 'items', 'dishes', 'people', 'menu', 'stock', 'extra_needs')
    ),
    entity_id text not null check (char_length(entity_id) between 1 and 200),
    position integer not null default 0 check (position >= 0),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    version bigint not null default 1 check (version > 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, entity_type, entity_id)
);

create table if not exists public.household_changes (
    change_id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_type text not null,
    entity_id text not null,
    operation text not null check (operation in ('upsert', 'delete')),
    position integer not null default 0,
    payload jsonb,
    record_version bigint not null,
    changed_at timestamptz not null default now()
);

create index if not exists household_changes_owner_cursor_idx
on public.household_changes (user_id, change_id);

create index if not exists household_changes_record_lookup_idx
on public.household_changes (user_id, entity_type, entity_id, change_id desc);

create table if not exists public.household_sync_operations (
    user_id uuid not null references auth.users(id) on delete cascade,
    operation_id text not null check (char_length(operation_id) between 8 and 200),
    result jsonb not null,
    created_at timestamptz not null default now(),
    primary key (user_id, operation_id)
);

create or replace function public.log_household_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        insert into public.household_changes (
            user_id, entity_type, entity_id, operation, position, payload, record_version
        ) values (
            old.user_id, old.entity_type, old.entity_id, 'delete', old.position, null, old.version
        );
        return old;
    end if;
    insert into public.household_changes (
        user_id, entity_type, entity_id, operation, position, payload, record_version
    ) values (
        new.user_id, new.entity_type, new.entity_id, 'upsert',
        new.position, new.payload, new.version
    );
    return new;
end;
$$;

drop trigger if exists household_record_changed on public.household_records;
create trigger household_record_changed
after insert or update or delete on public.household_records
for each row execute function public.log_household_record_change();

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
alter table public.household_records enable row level security;
alter table public.household_changes enable row level security;
alter table public.household_sync_operations enable row level security;
alter table public.account_lifecycle enable row level security;
alter table public.privacy_requests enable row level security;

revoke all on table public.household_state from anon;
revoke all on table public.household_records from anon;
revoke all on table public.household_changes from anon;
revoke all on table public.household_sync_operations from anon;
revoke all on table public.account_lifecycle from anon;
revoke all on table public.privacy_requests from anon;
revoke all on table public.account_lifecycle from authenticated;
revoke all on table public.privacy_requests from authenticated;
grant select, insert, update, delete on table public.household_state to authenticated;
revoke all on table public.household_records from authenticated;
revoke all on table public.household_changes from authenticated;
revoke all on table public.household_sync_operations from authenticated;
grant select on table public.household_records to authenticated;
grant select on table public.household_changes to authenticated;
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
    and not exists (
        select 1
        from public.household_records records
        where records.user_id = (select auth.uid())
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
    and not exists (
        select 1
        from public.household_records records
        where records.user_id = (select auth.uid())
    )
)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.account_lifecycle lifecycle
        where lifecycle.user_id = (select auth.uid())
    )
    and not exists (
        select 1
        from public.household_records records
        where records.user_id = (select auth.uid())
    )
);

drop policy if exists "household_state_delete_own" on public.household_state;
create policy "household_state_delete_own"
on public.household_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "household_records_select_own" on public.household_records;
create policy "household_records_select_own"
on public.household_records
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "household_changes_select_own" on public.household_changes;
create policy "household_changes_select_own"
on public.household_changes
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.get_household_sync_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
    result jsonb;
begin
    if current_user_id is null then
        raise exception 'authentication required';
    end if;
    select jsonb_build_object(
        'records', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'entity_type', records.entity_type,
                    'entity_id', records.entity_id,
                    'position', records.position,
                    'payload', records.payload,
                    'version', records.version
                ) order by records.entity_type, records.position, records.entity_id
            )
            from public.household_records records
            where records.user_id = current_user_id
        ), '[]'::jsonb),
        'cursor', coalesce((
            select max(changes.change_id)
            from public.household_changes changes
            where changes.user_id = current_user_id
        ), 0),
        'updated_at', (
            select max(changes.changed_at)
            from public.household_changes changes
            where changes.user_id = current_user_id
        )
    ) into result;
    return result;
end;
$$;

revoke all on function public.get_household_sync_snapshot() from public;
grant execute on function public.get_household_sync_snapshot() to authenticated;

create or replace function public.validate_household_sync_state(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1 from public.household_records records
        where records.user_id = target_user_id
          and records.entity_type = 'dishes'
          and case
              when jsonb_typeof(records.payload -> 'components') = 'array'
              then jsonb_array_length(records.payload -> 'components') = 0
              else true
          end
    ) or exists (
        select 1 from public.household_records records
        where records.user_id = target_user_id
          and records.entity_type = 'menu'
          and case
              when jsonb_typeof(records.payload -> 'people') = 'array'
              then jsonb_array_length(records.payload -> 'people') = 0
              else true
          end
    ) then
        raise exception 'dish components and menu people must be non-empty arrays';
    end if;

    if exists (
        select 1 from public.household_records records
        where records.user_id = target_user_id
          and records.entity_type in ('items', 'dishes', 'people')
          and records.payload ->> 'key' is distinct from records.entity_id
    ) or exists (
        select 1 from public.household_records records
        where records.user_id = target_user_id
          and records.entity_type = 'menu'
          and records.payload ->> 'id' is distinct from records.entity_id
    ) or exists (
        select 1 from public.household_records records
        where records.user_id = target_user_id
          and records.entity_type in ('stock', 'extra_needs')
          and records.payload ->> 'item_key' is distinct from records.entity_id
    ) then
        raise exception 'synchronization identity does not match record payload';
    end if;

    if exists (
        select 1
        from public.household_records dishes
        cross join lateral jsonb_array_elements(dishes.payload -> 'components') component
        where dishes.user_id = target_user_id
          and dishes.entity_type = 'dishes'
          and not exists (
              select 1 from public.household_records items
              where items.user_id = target_user_id
                and items.entity_type = 'items'
                and items.entity_id = component ->> 'item_key'
          )
    ) then
        raise exception 'dish component references an unknown item';
    end if;

    if exists (
        select 1 from public.household_records menu
        where menu.user_id = target_user_id
          and menu.entity_type = 'menu'
          and not exists (
              select 1 from public.household_records target
              where target.user_id = target_user_id
                and target.entity_type in ('items', 'dishes')
                and target.entity_id = menu.payload ->> 'item_key'
          )
    ) then
        raise exception 'menu entry references an unknown item';
    end if;

    if exists (
        select 1
        from public.household_records menu
        cross join lateral jsonb_array_elements_text(menu.payload -> 'people') person_key
        where menu.user_id = target_user_id
          and menu.entity_type = 'menu'
          and not exists (
              select 1 from public.household_records people
              where people.user_id = target_user_id
                and people.entity_type = 'people'
                and people.entity_id = person_key
          )
    ) then
        raise exception 'menu entry references an unknown person';
    end if;

    if exists (
        select 1 from public.household_records quantity
        where quantity.user_id = target_user_id
          and quantity.entity_type in ('stock', 'extra_needs')
          and not exists (
              select 1 from public.household_records items
              where items.user_id = target_user_id
                and items.entity_type = 'items'
                and items.entity_id = quantity.entity_id
          )
    ) then
        raise exception 'stock or extra need references an unknown item';
    end if;
end;
$$;

revoke all on function public.validate_household_sync_state(uuid) from public;

create or replace function public.apply_household_sync_operations(operations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
    requested jsonb;
    operation_id_value text;
    operation_kind text;
    entity_type_value text;
    entity_id_value text;
    expected_version_value bigint;
    position_value integer;
    payload_value jsonb;
    current_record public.household_records%rowtype;
    applied_result jsonb;
    applied jsonb := '[]'::jsonb;
    conflicts jsonb := '[]'::jsonb;
    current_cursor bigint;
begin
    if current_user_id is null then
        raise exception 'authentication required';
    end if;
    if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 10000 then
        raise exception 'operations must be an array of at most 10000 entries';
    end if;

    -- Browser roles cannot write the row tables directly. Serializing batches
    -- per account makes the version preflight and the following writes atomic.
    perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
    for requested in select value from jsonb_array_elements(operations)
    loop
        operation_id_value := requested ->> 'operation_id';
        operation_kind := requested ->> 'operation';
        entity_type_value := requested ->> 'entity_type';
        entity_id_value := requested ->> 'entity_id';
        expected_version_value := coalesce((requested ->> 'expected_version')::bigint, 0);
        if exists (
            select 1 from public.household_sync_operations receipts
            where receipts.user_id = current_user_id
              and receipts.operation_id = operation_id_value
        ) then
            continue;
        end if;
        select * into current_record
        from public.household_records records
        where records.user_id = current_user_id
          and records.entity_type = entity_type_value
          and records.entity_id = entity_id_value;
        if operation_kind = 'upsert' and (
            (found and current_record.version <> expected_version_value)
            or (not found and expected_version_value <> 0)
        ) then
            conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                'entity_type', entity_type_value,
                'entity_id', entity_id_value,
                'position', coalesce(current_record.position, 0),
                'payload', current_record.payload,
                'version', coalesce(current_record.version, 0),
                'operation', case when found then 'upsert' else 'delete' end
            ));
        elsif operation_kind = 'delete' and found
            and current_record.version <> expected_version_value then
            conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                'entity_type', current_record.entity_type,
                'entity_id', current_record.entity_id,
                'position', current_record.position,
                'payload', current_record.payload,
                'version', current_record.version,
                'operation', 'upsert'
            ));
        end if;
    end loop;
    if jsonb_array_length(conflicts) > 0 then
        select coalesce(max(changes.change_id), 0) into current_cursor
        from public.household_changes changes
        where changes.user_id = current_user_id;
        return jsonb_build_object(
            'applied', '[]'::jsonb,
            'conflicts', conflicts,
            'cursor', current_cursor
        );
    end if;

    for requested in select value from jsonb_array_elements(operations)
    loop
        operation_id_value := requested ->> 'operation_id';
        operation_kind := requested ->> 'operation';
        entity_type_value := requested ->> 'entity_type';
        entity_id_value := requested ->> 'entity_id';
        expected_version_value := coalesce((requested ->> 'expected_version')::bigint, 0);
        position_value := coalesce((requested ->> 'position')::integer, 0);
        payload_value := requested -> 'payload';

        if operation_id_value is null or char_length(operation_id_value) < 8 then
            raise exception 'invalid operation id';
        end if;
        if operation_kind not in ('upsert', 'delete') then
            raise exception 'invalid synchronization operation';
        end if;
        if entity_type_value not in ('app', 'items', 'dishes', 'people', 'menu', 'stock', 'extra_needs')
            or entity_id_value is null then
            raise exception 'invalid synchronization identity';
        end if;

        select receipts.result into applied_result
        from public.household_sync_operations receipts
        where receipts.user_id = current_user_id
          and receipts.operation_id = operation_id_value;
        if found then
            applied := applied || jsonb_build_array(applied_result);
            continue;
        end if;

        select * into current_record
        from public.household_records records
        where records.user_id = current_user_id
          and records.entity_type = entity_type_value
          and records.entity_id = entity_id_value
        for update;

        if operation_kind = 'upsert' then
            if payload_value is null or jsonb_typeof(payload_value) <> 'object' then
                raise exception 'upsert payload must be an object';
            end if;
            if found and current_record.version <> expected_version_value then
                conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                    'entity_type', current_record.entity_type,
                    'entity_id', current_record.entity_id,
                    'position', current_record.position,
                    'payload', current_record.payload,
                    'version', current_record.version,
                    'operation', 'upsert'
                ));
                continue;
            elsif found then
                update public.household_records records
                set position = position_value,
                    payload = payload_value,
                    version = records.version + 1,
                    updated_at = now()
                where records.user_id = current_user_id
                  and records.entity_type = entity_type_value
                  and records.entity_id = entity_id_value
                  and records.version = expected_version_value
                returning * into current_record;
            else
                if expected_version_value <> 0 then
                    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                        'entity_type', entity_type_value,
                        'entity_id', entity_id_value,
                        'position', position_value,
                        'payload', null,
                        'version', 0,
                        'operation', 'delete'
                    ));
                    continue;
                end if;
                begin
                    insert into public.household_records (
                        user_id, entity_type, entity_id, position, payload, version
                    ) values (
                        current_user_id, entity_type_value, entity_id_value,
                        position_value, payload_value, 1
                    ) returning * into current_record;
                exception when unique_violation then
                    select * into current_record
                    from public.household_records records
                    where records.user_id = current_user_id
                      and records.entity_type = entity_type_value
                      and records.entity_id = entity_id_value;
                    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                        'entity_type', current_record.entity_type,
                        'entity_id', current_record.entity_id,
                        'position', current_record.position,
                        'payload', current_record.payload,
                        'version', current_record.version,
                        'operation', 'upsert'
                    ));
                    continue;
                end;
            end if;
            select jsonb_build_object(
                'change_id', changes.change_id,
                'entity_type', current_record.entity_type,
                'entity_id', current_record.entity_id,
                'position', current_record.position,
                'payload', current_record.payload,
                'record_version', current_record.version,
                'operation', 'upsert'
            ) into applied_result
            from public.household_changes changes
            where changes.user_id = current_user_id
              and changes.entity_type = entity_type_value
              and changes.entity_id = entity_id_value
              and changes.record_version = current_record.version
            order by changes.change_id desc limit 1;
        else
            if not found then
                applied_result := jsonb_build_object(
                    'change_id', 0,
                    'entity_type', entity_type_value,
                    'entity_id', entity_id_value,
                    'position', 0,
                    'payload', null,
                    'record_version', expected_version_value,
                    'operation', 'delete'
                );
            elsif current_record.version <> expected_version_value then
                conflicts := conflicts || jsonb_build_array(jsonb_build_object(
                    'entity_type', current_record.entity_type,
                    'entity_id', current_record.entity_id,
                    'position', current_record.position,
                    'payload', current_record.payload,
                    'version', current_record.version,
                    'operation', 'upsert'
                ));
                continue;
            else
                delete from public.household_records records
                where records.user_id = current_user_id
                  and records.entity_type = entity_type_value
                  and records.entity_id = entity_id_value
                  and records.version = expected_version_value;
                select jsonb_build_object(
                    'change_id', changes.change_id,
                    'entity_type', changes.entity_type,
                    'entity_id', changes.entity_id,
                    'position', changes.position,
                    'payload', null,
                    'record_version', changes.record_version,
                    'operation', 'delete'
                ) into applied_result
                from public.household_changes changes
                where changes.user_id = current_user_id
                  and changes.entity_type = entity_type_value
                  and changes.entity_id = entity_id_value
                  and changes.operation = 'delete'
                order by changes.change_id desc limit 1;
            end if;
        end if;

        insert into public.household_sync_operations (user_id, operation_id, result)
        values (current_user_id, operation_id_value, applied_result);
        applied := applied || jsonb_build_array(applied_result);
    end loop;

    select coalesce(max(changes.change_id), 0) into current_cursor
    from public.household_changes changes
    where changes.user_id = current_user_id;
    update public.account_lifecycle
    set last_active_at = now()
    where user_id = current_user_id;
    perform public.validate_household_sync_state(current_user_id);
    return jsonb_build_object(
        'applied', applied,
        'conflicts', conflicts,
        'cursor', current_cursor
    );
end;
$$;

revoke all on function public.apply_household_sync_operations(jsonb) from public;
grant execute on function public.apply_household_sync_operations(jsonb) to authenticated;

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

-- Delete all household records, change history, private requests, lifecycle
-- data, and the Auth account in one transaction. Immediate deletion avoids
-- depending on a Cron
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
-- Deleting auth.users cascades to every related public table. This function is not
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
            and not exists (
                select 1
                from public.household_records records
                where records.user_id = lifecycle.user_id
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

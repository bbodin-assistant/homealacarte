import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");

for (const table of ["household_records", "household_changes", "household_sync_operations"]) {
  assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
}
assert.match(schema, /create or replace function public\.get_household_sync_snapshot\(\)/);
assert.match(schema, /create or replace function public\.apply_household_sync_operations\(operations jsonb\)/);
assert.match(schema, /after insert or update or delete on public\.household_records/);
assert.match(schema, /household_records_select_own/);
assert.match(schema, /household_changes_select_own/);
assert.match(schema, /operation_id text not null/);
assert.match(schema, /record_version bigint not null/);
const changeTrigger = schema.match(
  /create or replace function public\.log_household_record_change\(\)[\s\S]*?\$\$;/,
)?.[0] || "";
assert.doesNotMatch(changeTrigger, /target_user_id/);
assert.match(schema, /perform public\.validate_household_sync_state\(current_user_id\)/);

console.log("Supabase schema defines versioned rows, a durable cursor log, idempotency, and RLS.");

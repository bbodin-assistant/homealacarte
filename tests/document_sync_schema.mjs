import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
assert.match(schema, /create or replace function public\.get_household_state\(\)/);
assert.match(schema, /create or replace function public\.save_household_state\(/);
assert.match(schema, /pg_advisory_xact_lock/);
assert.match(schema, /expected_revision is distinct from current_state\.revision/);
assert.match(schema, /records\.payload - 'id'/);
assert.match(schema, /revoke all on function public\.apply_household_sync_operations\(jsonb\) from authenticated/);
assert.match(schema, /revoke all on table public\.household_state from authenticated/);
assert.match(schema, /grant execute on function public\.save_household_state\(jsonb, bigint\) to authenticated/);

console.log("Supabase owns atomic household document revisions and migrates away from row IDs.");

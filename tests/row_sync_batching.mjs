import assert from "node:assert/strict";
import { SYNC_BATCH_SIZE, selectSyncBatch } from "../www/storage/row-sync.js";

function operation(operation, entityType, entityId) {
  return {
    recordKey: `${entityType}\u0000${entityId}`,
    operationId: `operation-${operation}-${entityType}-${entityId}`,
    operation,
    entityType,
    entityId,
    position: 0,
    payload: operation === "upsert" ? { key: entityId } : null,
    expectedVersion: operation === "upsert" ? 0 : 1,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

assert.equal(SYNC_BATCH_SIZE, 100);
const largeBatch = selectSyncBatch(
  Array.from({ length: 125 }, (_, index) => operation("upsert", "items", `item-${index}`)),
);
assert.equal(largeBatch.length, SYNC_BATCH_SIZE);

const ordered = selectSyncBatch([
  operation("delete", "items", "old-item"),
  operation("upsert", "menu", "menu-1"),
  operation("delete", "dishes", "old-dish"),
  operation("upsert", "dishes", "dish-1"),
  operation("upsert", "people", "person-1"),
  operation("upsert", "items", "item-1"),
  operation("delete", "menu", "old-menu"),
], 20);

assert.deepEqual(
  ordered.map(({ operation: kind, entityType }) => `${kind}:${entityType}`),
  [
    "upsert:items",
    "upsert:people",
    "upsert:dishes",
    "upsert:menu",
    "delete:menu",
    "delete:dishes",
    "delete:items",
  ],
);

console.log("Synchronization uploads bounded, dependency-safe batches.");

import assert from "node:assert/strict";
import { createWorkerResponseHandler } from "../www/core/worker-responses.js";

const busy = [];
const errors = [];
const sent = [];
let cleared = 0;
const state = {
  language: "fr",
  pendingDataAction: { requestId: 4 },
  restoreMenu: [{ day: "Monday" }],
};
const handle = createWorkerResponseHandler({
  state,
  translate: (key) => `translated:${key}`,
  setBusy: (...args) => busy.push(args),
  showError: (...args) => errors.push(args),
  clearError: () => { cleared += 1; },
  send: (...args) => sent.push(args),
});

await handle({ type: "status", code: "loading" });
assert.deepEqual(busy, [[true, "translated:loading"]]);

await handle({ type: "error", requestId: 4, message: "broken", code: "worker_error" });
assert.equal(state.pendingDataAction, null);
assert.deepEqual(errors, [["broken", "worker_error"]]);

await handle({
  type: "snapshot",
  snapshot: {
    language: "en",
    people: [],
    planner: [],
    stock: [],
    custom_grocery: [],
  },
});
assert.equal(cleared, 1);
assert.equal(state.restoreMenu, null);
assert.deepEqual(sent, [["replace-menu", { rows: [{ day: "Monday" }] }]]);

console.log("Worker responses own status, error, snapshot replacement, and restoration routing.");

let persisted = 0;
let rendered = 0;
const synchronizedState = {
  language: "fr",
  nonPersistingRequestIds: new Set([12]),
};
const synchronizedHandle = createWorkerResponseHandler({
  state: synchronizedState,
  clearError: () => {},
  persistDraft: () => { persisted += 1; },
  render: () => { rendered += 1; },
  setBusy: () => {},
});
await synchronizedHandle({
  type: "snapshot",
  requestId: 12,
  source: "synchronized",
  snapshot: {
    language: "en",
    people: [],
    planner: [],
    stock: [],
    custom_grocery: [],
  },
});
assert.equal(persisted, 0, "remote hydration must not write the snapshot back to synchronization");
assert.equal(rendered, 1);
assert.equal(synchronizedState.nonPersistingRequestIds.size, 0);

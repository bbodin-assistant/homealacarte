import assert from "node:assert/strict";
import {
  createWorkerClient,
  shouldHandleWorkerMessage,
} from "../www/core/worker-client.js";

assert.equal(shouldHandleWorkerMessage({ requestId: 2, type: "snapshot" }, 3), false);
assert.equal(shouldHandleWorkerMessage({ requestId: 2, type: "status" }, 3), true);
assert.equal(shouldHandleWorkerMessage({ requestId: 3, type: "snapshot" }, 3), true);

const posted = [];
const messages = [];
const errors = [];
const busy = [];
const worker = { postMessage: (message) => posted.push(message) };
const state = { requestId: 4, latestRequest: 4 };
const client = createWorkerClient({
  worker,
  state,
  setBusy: (value) => busy.push(value),
  handleMessage: (data) => messages.push(data),
  handleError: (...error) => errors.push(error),
});

assert.equal(client.send("replace-menu", { rows: [1] }), 5);
assert.deepEqual(posted, [{ requestId: 5, type: "replace-menu", rows: [1] }]);
assert.deepEqual(busy, [true]);

worker.onmessage({ data: { requestId: 4, type: "snapshot" } });
worker.onmessage({ data: { requestId: 5, type: "snapshot" } });
assert.deepEqual(messages, [{ requestId: 5, type: "snapshot" }]);

let prevented = false;
worker.onerror({ message: "boom", preventDefault: () => { prevented = true; } });
worker.onmessageerror();
assert.equal(prevented, true);
assert.deepEqual(errors, [["boom", "worker_error"], ["", "worker_error"]]);

console.log("Worker client owns request IDs, stale-response filtering, and transport errors.");

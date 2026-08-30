import assert from "node:assert/strict";
import {
  MENU_DRAG_NAVIGATION_DELAY_MS,
  createDragNavigationRepeater,
} from "../www/features/menu/navigation.js";

let nextTimer = 1;
const timers = new Map();
const cleared = [];
const movements = [];
const repeater = createDragNavigationRepeater(
  (days) => movements.push(days),
  {
    setTimer(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) {
      cleared.push(id);
      timers.delete(id);
    },
  },
);

assert.equal(MENU_DRAG_NAVIGATION_DELAY_MS, 1000);
repeater.start(1);
assert.equal(timers.size, 1);
assert.equal([...timers.values()][0].delay, 1000);
repeater.start(1);
assert.equal(timers.size, 1, "repeated dragover events must not restart the delay");

let pending = [...timers.entries()][0];
timers.delete(pending[0]);
pending[1].callback();
assert.deepEqual(movements, [1]);
assert.equal(timers.size, 1, "navigation repeats after its first one-second step");

pending = [...timers.entries()][0];
timers.delete(pending[0]);
pending[1].callback();
assert.deepEqual(movements, [1, 1]);

repeater.start(-7);
assert.equal(timers.size, 1);
pending = [...timers.entries()][0];
timers.delete(pending[0]);
pending[1].callback();
assert.deepEqual(movements, [1, 1, -7]);

repeater.stop();
assert.equal(timers.size, 0);
assert.ok(cleared.length > 0);

console.log("Drag navigation waits one second, repeats, changes direction, and stops deterministically.");

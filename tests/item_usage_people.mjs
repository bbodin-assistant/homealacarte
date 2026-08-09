import assert from "node:assert/strict";
import { menuUsageContext } from "../www/core/item-details.js";

const people = [
  { key: "alice", name: "Alice" },
  { key: "bob", name: "Bob" },
];

assert.equal(
  menuUsageContext({
    day: "Monday",
    meal: "Dinner",
    people: ["alice", "bob"],
  }, people),
  "Monday · Dinner · Alice, Bob",
);

assert.equal(
  menuUsageContext({
    day: "Tuesday",
    meal: "Lunch",
    people: ["unknown-person"],
  }, people),
  "Tuesday · Lunch · unknown-person",
);

console.log("Item menu usages include the household members having each meal.");

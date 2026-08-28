import assert from "node:assert/strict";

const origin = process.argv[2] || "http://127.0.0.1:18081";
const port = process.argv[3] || "9223";
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "Chromium page target is available");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Page.navigate", { url: `${origin}/#items` });
await waitFor(
  `document.documentElement.dataset.appModuleLoaded === "true"
    && [...document.querySelectorAll("#item-catalogue .item-catalogue-row")]
      .some((row) => row.textContent.includes("Trésor"))`,
  "the Trésor catalogue row",
);

const initialBadge = await evaluate(`(() => {
  const row = [...document.querySelectorAll("#item-catalogue .item-catalogue-row")]
    .find((candidate) => candidate.textContent.includes("Trésor"));
  return row?.querySelector(".item-allergen-badges")?.getAttribute("aria-label") || "";
})()`);
assert.match(initialBadge, /Hazelnuts|Noisettes/);

await evaluate(`(() => {
  const row = [...document.querySelectorAll("#item-catalogue .item-catalogue-row")]
    .find((candidate) => candidate.textContent.includes("Trésor"));
  row.querySelector("[data-item-edit]").click();
})()`);
await waitFor(
  `!document.querySelector("#ingredient-form").hidden
    && document.querySelector('#ingredient-allergens input[value="hazelnut"]:checked')`,
  "the populated allergen editor",
);


await evaluate(`(() => {
  const input = document.querySelector('#ingredient-allergens input[value="milk"]');
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await waitFor(`!document.querySelector("#ingredient-save").disabled`, "the enabled save button");
await evaluate(`document.querySelector("#ingredient-save").click()`);
await waitFor(
  `document.querySelector('#ingredient-allergens input[value="milk"]:checked')
    && document.querySelector("#ingredient-save").disabled`,
  "the saved allergen state",
);
await evaluate(`document.querySelector(".item-editor-back").click()`);
await waitFor(`!document.querySelector("#item-catalogue").hidden`, "the catalogue view");

const savedBadge = await evaluate(`(() => {
  const row = [...document.querySelectorAll("#item-catalogue .item-catalogue-row")]
    .find((candidate) => candidate.textContent.includes("Trésor"));
  return row?.querySelector(".item-allergen-badges")?.getAttribute("aria-label") || "";
})()`);
assert.match(savedBadge, /Hazelnuts|Noisettes/);
assert.match(savedBadge, /Milk|Lait/);

await evaluate(`(() => {
  const row = [...document.querySelectorAll("#item-catalogue .item-catalogue-row")]
    .find((candidate) => candidate.textContent.includes("Trésor"));
  row.click();
})()`);
await waitFor(
  `document.querySelector("#grocery-details-dialog").open
    && document.querySelector("#grocery-details-title").textContent.includes("Trésor")
    && document.querySelector("#grocery-details-information .item-detail-allergens")`,
  "the Trésor allergen details",
);
const detailAllergens = await evaluate(
  `document.querySelector("#grocery-details-information .item-detail-allergens").textContent`,
);
assert.match(detailAllergens, /Hazelnuts|Noisettes/);
assert.match(detailAllergens, /Milk|Lait/);

socket.close();
console.log("Catalogue allergen editing persists and updates catalogue and detail displays in Chromium.");

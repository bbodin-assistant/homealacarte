const origin = process.argv[2];
const debuggerOrigin = process.argv[3];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let page;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    const pages = await fetch(`${debuggerOrigin}/json/list`).then((response) => response.json());
    page = pages.find((entry) => entry.type === "page");
    if (page) break;
  } catch {}
  await wait(100);
}
if (!page) throw new Error("Chromium debugging page did not become ready");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 0;
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
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await command("Page.enable");
await command("Runtime.enable");
await command("Page.navigate", { url: `${origin}/tests/row_sync_browser.html` });

let result = "pending";
for (let attempt = 0; attempt < 100; attempt += 1) {
  const response = await command("Runtime.evaluate", {
    expression: "document.body?.dataset?.result || 'pending'",
    returnByValue: true,
  });
  result = response.result.value;
  if (result !== "pending") break;
  await wait(100);
}
if (result !== "passed") {
  const response = await command("Runtime.evaluate", {
    expression: "document.body?.innerText || 'No browser result'",
    returnByValue: true,
  });
  throw new Error(`Row synchronization browser test ${result}: ${response.result.value}`);
}
socket.close();
console.log("Relational IndexedDB rows, outbox acknowledgements, and scoped conflicts work in Chromium.");

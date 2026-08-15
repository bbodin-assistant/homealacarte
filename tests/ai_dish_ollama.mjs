import assert from "node:assert/strict";
import {
  AI_RECIPE_SCHEMA,
  INGREDIENT_MATCH_SCHEMA,
  buildIngredientMatchRequest,
  buildOpenAiRequest,
  buildOllamaRequest,
  discoverAiServer,
  fetchOllamaJson,
  findUniqueExactIngredientMatch,
  generateRecipeWithOllama,
  isLoopbackOllamaUrl,
  listOllamaModels,
  normalizeOllamaUrl,
  selectIngredientCandidates,
} from "../www/features/ai-dish/ollama.js";

assert.equal(normalizeOllamaUrl("127.0.0.1:11434/api/"), "http://127.0.0.1:11434");
assert.equal(normalizeOllamaUrl("127.0.0.1:8080/v1/"), "http://127.0.0.1:8080");
assert.equal(isLoopbackOllamaUrl("http://127.0.0.1:11434"), true);
assert.equal(isLoopbackOllamaUrl("https://ollama.example.com"), false);
assert.throws(() => normalizeOllamaUrl("file:///tmp/ollama"), /http or https/i);

const ingredientOptions = [
  { kind: "ingredient", key: "rice", name: "Basmati rice", measure_unit: "g" },
  { kind: "ingredient", key: "brown_rice", name: "Brown rice", measure_unit: "g" },
  { kind: "ingredient", key: "milk", name: "Milk", measure_unit: "ml" },
  { kind: "ingredient", key: "chicken", name: "Chicken breast", measure_unit: "g" },
];
const candidates = selectIngredientCandidates(ingredientOptions, "Basmati rice");
assert.equal(candidates[0].key, "rice");
assert.equal(candidates.some((candidate) => candidate.key === "milk"), false);
assert.equal(findUniqueExactIngredientMatch(ingredientOptions, "basmati RICE")?.key, "rice");
assert.equal(findUniqueExactIngredientMatch([
  ...ingredientOptions,
  { kind: "ingredient", key: "rice_duplicate", name: "Basmati rice", measure_unit: "g" },
], "Basmati rice"), null);

const extractionRequest = buildOllamaRequest({
  model: "local-book-model",
  recipeText: "200 g basmati rice",
});
assert.equal(extractionRequest.model, "local-book-model");
assert.equal(extractionRequest.format, AI_RECIPE_SCHEMA);
assert.equal(extractionRequest.messages[1].content.includes("Existing ingredient catalogue"), false);
assert.match(extractionRequest.messages[0].content, /standalone custom ingredient/i);
assert.match(extractionRequest.messages[0].content, /gram quantity/i);

const matchRequest = buildIngredientMatchRequest({
  model: "local-book-model",
  ingredient: {
    name: "Basmati rice",
    quantity: 200,
    unit: "g",
    source_quantity: "200 g",
    note: "",
  },
  candidates,
});
assert.equal(matchRequest.format, INGREDIENT_MATCH_SCHEMA);
assert.match(matchRequest.messages[1].content, /Basmati rice/);
assert.match(matchRequest.messages[1].content, /"key":"rice"/);

const openAiRequest = buildOpenAiRequest(extractionRequest);
assert.equal(openAiRequest.response_format.type, "json_schema");
assert.equal(openAiRequest.response_format.json_schema.schema, AI_RECIPE_SCHEMA);

const modelFetches = [];
const fakeFetch = async (url, options) => {
  modelFetches.push({ url, options });
  return {
    ok: true,
    json: async () => ({ models: [{ name: "z-model" }, { model: "a-model" }] }),
  };
};
assert.deepEqual(await listOllamaModels("localhost:11434", { fetchImpl: fakeFetch }), ["a-model", "z-model"]);

const openAiRequests = [];
const fakeOpenAiFetch = async (url, options) => {
  openAiRequests.push({ url, options });
  if (url.endsWith("/api/tags")) {
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "File Not Found" } }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: "local-book-model" }] }),
  };
};
assert.deepEqual(
  await discoverAiServer("127.0.0.1:8080/v1", { fetchImpl: fakeOpenAiFetch }),
  { provider: "openai", models: ["local-book-model"] },
);

const extractedRecipe = {
  name: "Rice with milk",
  servings: 2,
  recipe_url: "",
  source: "test",
  source_notes: [],
  auto_menu_main: false,
  ingredients: [
    { name: "Basmati rice", quantity: 200, unit: "g", source_quantity: "200 g", note: "" },
    { name: "Coconut cream", quantity: 100, unit: "g", source_quantity: "100 ml", note: "thick coconut cream" },
  ],
};
const encoder = new TextEncoder();
const requests = [];

function sse(content, reasoning = "") {
  return new ReadableStream({
    start(controller) {
      if (reasoning) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning } }] })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

const twoStepFetch = async (url, options) => {
  requests.push({ url, options });
  if (url.endsWith("/api/tags")) {
    return { ok: false, status: 404, json: async () => ({ error: { message: "File Not Found" } }) };
  }
  if (url.endsWith("/v1/models")) {
    return { ok: true, status: 200, json: async () => ({ data: [{ id: "local-book-model" }] }) };
  }
  return { ok: true, status: 200, body: sse(JSON.stringify(extractedRecipe), "extracting ") };
};

const progress = [];
const chunks = [];
const result = await generateRecipeWithOllama({
  baseUrl: "127.0.0.1:8080",
  model: "local-book-model",
  recipeText: "200 g basmati rice and 100 ml coconut cream",
  ingredientOptions,
  fetchImpl: twoStepFetch,
  onChunk: (chunk) => chunks.push(chunk),
  onProgress: (event) => progress.push(event),
});
assert.equal(result.recipe.ingredients[0].existing_key, "rice");
assert.equal(result.recipe.ingredients[1].existing_key, "");
assert.equal(chunks.join(""), `extracting ${JSON.stringify(extractedRecipe)}`);
assert.deepEqual(progress.map((event) => event.phase), ["extracting", "matching", "matched", "matching", "matched"]);
assert.equal(progress[1].method, "exact");
assert.equal(progress[2].existingName, "Basmati rice");
assert.equal(progress[3].method, "custom");

const generationBodies = requests
  .filter((request) => request.url.endsWith("/v1/chat/completions"))
  .map((request) => JSON.parse(request.options.body));
assert.equal(generationBodies.length, 1);
assert.equal(generationBodies[0].messages[1].content.includes("Candidate existing ingredients"), false);
assert.equal(generationBodies[0].stream, true);

const hangingFetch = (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  });
});
await assert.rejects(
  fetchOllamaJson("http://localhost/test", {}, { timeoutMs: 5, fetchImpl: hangingFetch }),
  (error) => error?.code === "timeout",
);

console.log("AI dish two-step extraction/matching transport validates schemas, exact-match shortcuts, streaming, progress, and timeouts.");

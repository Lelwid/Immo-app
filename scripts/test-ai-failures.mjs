import assert from "node:assert/strict";
import { OpenAiHttpError, requestOpenAiJson } from "../src/lib/server/openAiHttp.ts";

const secretMarker = "test-key-never-print";

const success = await requestOpenAiJson({ input: [] }, secretMarker, {
  fetcher: async () => new Response(JSON.stringify({ output: [] }), { status: 200 }),
  timeoutMs: 50,
});
assert.deepEqual(success, { output: [] });

await assert.rejects(
  requestOpenAiJson({}, secretMarker, {
    fetcher: async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "sensitive upstream text", type: "requests" } }), { status: 429 }),
    timeoutMs: 50,
  }),
  (error) => error instanceof OpenAiHttpError && error.kind === "api" && error.status === 429 && JSON.stringify(error.responseBody) === '{"code":"rate_limit_exceeded","type":"requests"}',
);

await assert.rejects(
  requestOpenAiJson({}, secretMarker, {
    fetcher: async () => new Response("not-json", { status: 200 }),
    timeoutMs: 50,
  }),
  (error) => error instanceof OpenAiHttpError && error.kind === "invalid_response",
);

await assert.rejects(
  requestOpenAiJson({}, secretMarker, {
    fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
    timeoutMs: 5,
  }),
  (error) => error instanceof OpenAiHttpError && error.kind === "timeout",
);

console.log("AI failure simulations: timeout PASS; API error PASS; invalid response PASS; sanitized error PASS");

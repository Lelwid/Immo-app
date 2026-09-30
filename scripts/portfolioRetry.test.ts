import assert from "node:assert/strict";
import test from "node:test";
import { isTransientDataError, withTransientRetry } from "@/lib/data/transientRetry";

test("retries a temporary 429 and then resolves", async () => {
  let calls = 0;
  const value = await withTransientRetry(
    async () => {
      calls += 1;
      if (calls < 2) {
        throw Object.assign(new Error("Too many requests"), { status: 429 });
      }
      return "ok";
    },
    { delaysMs: [0, 0] },
  );

  assert.equal(value, "ok");
  assert.equal(calls, 2);
});

test("stops after the configured retries for a persistent gateway failure", async () => {
  let calls = 0;

  await assert.rejects(
    withTransientRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("Gateway timeout"), { status: 504 });
      },
      { delaysMs: [0, 0] },
    ),
  );

  assert.equal(calls, 3);
});

test("retries an isolated internal server error", async () => {
  let calls = 0;
  const value = await withTransientRetry(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("Internal server error"), { status: 500 });
      }
      return "ok";
    },
    { delaysMs: [0, 0] },
  );

  assert.equal(value, "ok");
  assert.equal(calls, 2);
});

test("does not retry authentication, permission, schema, validation, or cancelled requests", async () => {
  const failures = [
    Object.assign(new Error("Unauthorized"), { status: 401 }),
    Object.assign(new Error("Insufficient privilege"), { code: "42501", status: 403 }),
    Object.assign(new Error("Missing column"), { code: "42703", status: 400 }),
    Object.assign(new Error("Validation failed"), { code: "23514", status: 400 }),
    Object.assign(new Error("Navigation cancelled"), { name: "AbortError" }),
  ];

  for (const failure of failures) {
    let calls = 0;
    await assert.rejects(
      withTransientRetry(
        async () => {
          calls += 1;
          throw failure;
        },
        { delaysMs: [0, 0] },
      ),
    );
    assert.equal(calls, 1);
    assert.equal(isTransientDataError(failure), false);
  }
});

test("recognizes nested network and database connection errors", () => {
  assert.equal(isTransientDataError(Object.assign(new Error("Snapshot failed"), { cause: new TypeError("Failed to fetch") })), true);
  assert.equal(isTransientDataError(Object.assign(new Error("Snapshot failed"), { cause: { code: "PGRST003" } })), true);
  assert.equal(isTransientDataError(Object.assign(new Error("Snapshot failed"), { cause: { code: "08006" } })), true);
});

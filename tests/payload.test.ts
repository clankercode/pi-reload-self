import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeReloadPayload,
  encodeReloadPayload,
  validateContinuationPrompt,
} from "../src/payload.ts";

test("validateContinuationPrompt returns trimmed non-empty prompt", () => {
  assert.equal(validateContinuationPrompt("  continue now  "), "continue now");
});

test("validateContinuationPrompt rejects empty prompts", () => {
  assert.throws(
    () => validateContinuationPrompt("   "),
    /continuation_prompt must be a non-empty string/,
  );
});

test("validateContinuationPrompt rejects non-string prompts", () => {
  assert.throws(
    () => validateContinuationPrompt(null),
    /continuation_prompt must be a non-empty string/,
  );
});

test("encodeReloadPayload and decodeReloadPayload round-trip multiline prompts", () => {
  const encoded = encodeReloadPayload({ continuationPrompt: "line one\nline two" });

  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeReloadPayload(encoded), { continuationPrompt: "line one\nline two" });
});

test("decodeReloadPayload rejects invalid base64 or shape", () => {
  assert.throws(() => decodeReloadPayload("not valid !!!"), /Invalid reload payload/);
});

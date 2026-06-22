# pi-reload-self Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a Pi package exposing `pi_extension_dev_reload_self(continuation_prompt, confirm_state_loss)`.

**Architecture:** The public tool validates inputs and queues an internal slash command because Pi tools cannot call `ctx.reload()` directly. The internal command decodes a base64url JSON payload, calls `ctx.reload()`, then sends the continuation prompt in the reloaded session flow.

**Tech Stack:** TypeScript ESM, Pi extension API, `typebox`, Node built-in test runner with `tsx`, npm package manifest, justfile.

## Global Constraints

- Public tool name must be exactly `pi_extension_dev_reload_self`.
- Reload mode is in-place, not a new session.
- Safety gate requires `confirm_state_loss: true`.
- Tool description must warn reload can reset extension/module in-memory state and extension-maintained runtime state.
- Package must be installable by Pi via `pi.extensions` manifest.
- Use TDD for production code.

---

## File Structure

- `package.json` — package metadata, Pi manifest, scripts, dependencies.
- `tsconfig.json` — TypeScript config compatible with Pi extension TypeScript loading.
- `justfile` — standard local commands.
- `README.md` — install, usage, warning, development, publishing notes.
- `src/payload.ts` — pure validation/encoding/decoding helpers.
- `src/index.ts` — Pi extension entrypoint registering tool and internal command.
- `tests/payload.test.ts` — unit tests for payload behavior.

### Task 1: Project scaffold and payload helpers

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `justfile`
- Create: `src/payload.ts`
- Create: `tests/payload.test.ts`

**Interfaces:**
- Produces: `ReloadPayload` type with `{ continuationPrompt: string }`.
- Produces: `validateContinuationPrompt(value: unknown): string`.
- Produces: `encodeReloadPayload(payload: ReloadPayload): string`.
- Produces: `decodeReloadPayload(encoded: string): ReloadPayload`.

- [ ] **Step 1: Write failing payload tests**

Create `tests/payload.test.ts` with tests asserting:

```ts
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
  assert.throws(() => validateContinuationPrompt("   "), /continuation_prompt must be a non-empty string/);
});

test("encodeReloadPayload and decodeReloadPayload round-trip multiline prompts", () => {
  const encoded = encodeReloadPayload({ continuationPrompt: "line one\nline two" });
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeReloadPayload(encoded), { continuationPrompt: "line one\nline two" });
});

test("decodeReloadPayload rejects invalid base64 or shape", () => {
  assert.throws(() => decodeReloadPayload("not valid !!!"), /Invalid reload payload/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/payload.test.ts`

Expected: FAIL because `src/payload.ts` does not exist.

- [ ] **Step 3: Add scaffold and minimal payload implementation**

Create scripts and config, then implement `src/payload.ts` with base64url JSON encode/decode and strict prompt validation.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/payload.test.ts`

Expected: all payload tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json justfile src/payload.ts tests/payload.test.ts
git commit -m "feat: add reload payload helpers"
```

### Task 2: Register Pi tool and command

**Files:**
- Create/Modify: `src/index.ts`
- Modify: `tests/payload.test.ts` only if a new pure helper is needed.

**Interfaces:**
- Consumes: `validateContinuationPrompt`, `encodeReloadPayload`, `decodeReloadPayload` from `src/payload.ts`.
- Produces: default extension function `(pi: ExtensionAPI) => void`.
- Produces public tool `pi_extension_dev_reload_self`.
- Produces command `pi-reload-self-run`.

- [ ] **Step 1: Write code with the minimal command/tool flow**

Register command:

```ts
pi.registerCommand("pi-reload-self-run", {
  description: "Internal command used by pi_extension_dev_reload_self to reload Pi and continue",
  handler: async (args, ctx) => {
    const payload = decodeReloadPayload(args.trim());
    await ctx.reload();
    pi.sendUserMessage(payload.continuationPrompt, { deliverAs: "followUp" });
  },
});
```

Register tool with schema:

```ts
parameters: Type.Object({
  continuation_prompt: Type.String({ description: "Prompt to send after Pi reloads." }),
  confirm_state_loss: Type.Boolean({ description: "Must be true. Reload can reset extension in-memory state." }),
})
```

If confirmation is false, return a refusal result and do not queue the command.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register reload self tool"
```

### Task 3: Documentation and package polish

**Files:**
- Create/Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces documented install commands: `pi install git:github.com/clankercode/pi-reload-self` and local path loading.
- Produces usage example with `confirm_state_loss: true`.

- [ ] **Step 1: Write README**

Include:

- What the extension does.
- Strong state-loss warning.
- Install from GitHub.
- Local development command.
- Tool parameters.
- Development commands.

- [ ] **Step 2: Run package checks**

Run: `just check`

Expected: typecheck and tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md package.json
git commit -m "docs: add usage documentation"
```

### Task 4: Review, smoke test, publish

**Files:**
- No planned source changes unless review finds issues.

**Interfaces:**
- Consumes completed package.
- Produces public GitHub repo `clankercode/pi-reload-self`.

- [ ] **Step 1: Run verification**

Run: `just check`

Expected: exit 0.

- [ ] **Step 2: Request independent review**

Dispatch a reviewer against the diff from `2dfd38e` to current HEAD. Fix Critical and Important findings.

- [ ] **Step 3: Ask user for interactive reload test if needed**

Use `attn` with a short spoken message asking for help reloading/testing in Pi if automated smoke testing cannot prove tool behavior.

- [ ] **Step 4: Create and push GitHub repository**

Run:

```bash
gh repo create clankercode/pi-reload-self --public --source=. --remote=origin --description "Pi extension development helper that lets agents reload Pi and continue in-session." --push
gh repo edit clankercode/pi-reload-self --add-topic pi --add-topic pi-extension --add-topic pi-package --add-topic coding-agent --add-topic reload --add-topic typescript
```

Expected: public repository exists with pushed commits and metadata.

--- SUMMARY ---

- Implement payload validation and encoding first with failing tests.
- Register a Pi extension tool that requires explicit state-loss confirmation.
- Queue an internal command because only command contexts can call `ctx.reload()`.
- The command reloads in-place and sends the continuation prompt afterward.
- Document install/use warnings, run type/tests, request review, perform smoke testing, then publish to GitHub.
# pi-reload-self Design

## Goal

Build a small Pi package that exposes an LLM-callable tool named `pi_extension_dev_reload_self`. The tool lets an agent reload Pi extensions/resources and continue in the same session with a caller-provided prompt.

This is primarily for extension development: after editing an extension, the agent can request a Pi reload and then resume with a continuation instruction.

## User-facing behavior

### Tool

Name: `pi_extension_dev_reload_self`

Parameters:

- `continuation_prompt: string` — non-empty prompt to send after reload.
- `confirm_state_loss: boolean` — must be `true` or the tool refuses to queue reload.

The tool description and prompt guidance must warn that reload can reset extension/module in-memory state, unload/reload resources, and affect other extension-maintained runtime state. Agents should only call it when the user requested reload behavior or when reloading development changes is necessary.

### Flow

1. The LLM calls `pi_extension_dev_reload_self` with a continuation prompt and `confirm_state_loss: true`.
2. The tool validates inputs.
3. The tool queues an internal slash command as a follow-up user message.
4. The command decodes the payload, calls `ctx.reload()`, then queues the continuation prompt as a follow-up user message.
5. The next agent turn runs in the reloaded extension/resource environment.

## Pi API constraints

Pi only exposes `ctx.reload()` on `ExtensionCommandContext`, not on the `ExtensionContext` passed to tool executions. Therefore the public tool cannot call reload directly. It must queue a command, and the command performs the reload.

Pi documentation warns that code after `await ctx.reload()` continues from the pre-reload call frame. Therefore the command must treat reload as terminal except for the minimal action of sending the serialized continuation prompt via the replacement/reloaded runtime-safe API path.

## Architecture

### Package structure

- `package.json` — npm/Pi package metadata and Pi manifest.
- `src/index.ts` — extension entrypoint; registers the public tool and internal command.
- `src/payload.ts` — pure helpers for validating, encoding, and decoding command payloads.
- `tests/payload.test.ts` — unit tests for payload validation and round-trip behavior.
- `README.md` — install, use, warnings, and development commands.
- `justfile` — common developer commands.
- `docs/superpowers/specs/2026-06-22-pi-reload-self-design.md` — this design.

### Internal command

Use a namespaced command such as `/pi-reload-self-run <payload>`. The command is intentionally not the main user-facing interface, but it will appear in command listings because Pi commands are public once registered.

The command payload should be encoded so multiline prompts survive command argument parsing. JSON serialized to base64url is sufficient.

### Tool result

On success, the tool returns a concise message that reload has been queued. It should not claim reload already happened.

On missing confirmation or invalid prompt, the tool throws or returns a clear refusal message. Prefer returning a normal tool result for missing confirmation so the agent sees the safety reason without marking the extension broken.

## Error handling

- Empty or whitespace-only continuation prompts are rejected.
- Missing/false `confirm_state_loss` returns a warning and does not queue reload.
- Invalid internal command payload shows a UI warning when available and does not reload.
- The command avoids storing continuation state in closure/module variables because reload creates fresh extension instances.

## Validation

Mechanical checks:

- `npm install`
- `just typecheck`
- `just test`
- `just check`

Manual/integration check if feasible:

- Load with `pi -ne -e ./src/index.ts`.
- Ask the agent to call `pi_extension_dev_reload_self` with confirmation and a visible continuation prompt.
- Confirm the session reloads and the continuation prompt is delivered after reload.

Review:

- Self-review against this design and Pi docs.
- Independent code review before final push.

## Publishing

Create and push a public GitHub repository at `clankercode/pi-reload-self`.

Repository metadata:

- Description: `Pi extension development helper that lets agents reload Pi and continue in-session.`
- Topics: `pi`, `pi-extension`, `pi-package`, `coding-agent`, `reload`, `typescript`

## Open decisions resolved

- Reload mode: reload in place, not a new session.
- Safety gate: require explicit `confirm_state_loss: true`.

--- SUMMARY ---

- Build a minimal TypeScript Pi package exposing `pi_extension_dev_reload_self`.
- The public tool validates `continuation_prompt` and requires `confirm_state_loss: true`.
- Because tools cannot call `ctx.reload()`, the tool queues an internal slash command.
- The command decodes a base64url payload, calls `ctx.reload()`, then sends the continuation prompt.
- Package includes README, justfile, payload unit tests, typecheck/test/check commands, and GitHub metadata.
- Validation includes unit/type checks, PIRFL-style review, and a best-effort Pi smoke test.
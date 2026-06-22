# pi-reload-self

Pi extension development helper that lets agents reload Pi and continue in the same session.

It registers one LLM-callable tool:

```ts
pi_extension_dev_reload_self({
  continuation_prompt: "Continue after reload...",
  confirm_state_loss: true,
})
```

## Warning

Reloading Pi can reset extension/module in-memory state, hot-loaded resources, timers, watchers, and other extension-maintained runtime state. Use this only when you explicitly want Pi to reload extensions, skills, prompts, and themes.

The tool requires `confirm_state_loss: true` so agents cannot queue a reload accidentally.

## Install

From GitHub:

```bash
pi install git:github.com/clankercode/pi-reload-self
```

For local development from this repository:

```bash
pi -ne -e ./src/index.ts
```

Or install the local package path:

```bash
pi install /path/to/pi-reload-self
```

## Tool behavior

`pi_extension_dev_reload_self` accepts:

- `continuation_prompt` — non-empty prompt sent after reload.
- `confirm_state_loss` — must be `true`.

Flow:

1. The tool validates the prompt and confirmation.
2. If the running Pi version exposes reload from tool context, it reloads directly and sends the continuation prompt.
3. Otherwise, it fills the editor with an internal `/pi-reload-self-run ...` command for you to submit.
4. The command calls Pi's reload flow.
5. After reload, the continuation prompt is sent as a follow-up user message.

The extension reloads in place; it does not create a new session.

In Pi 0.79.x, tool contexts do not expose `ctx.reload()`, and extension-injected slash commands are delivered as chat rather than executed as commands. In that case, submit the prefilled `/pi-reload-self-run ...` command manually to complete the reload.

## Development

```bash
npm install
just check
```

Individual commands:

```bash
just test
just typecheck
```

## Package manifest

This package declares its Pi extension entrypoint in `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

## License

MIT

import assert from "node:assert/strict";
import test from "node:test";

import extension from "../src/index.ts";

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: FakeCommandContext) => Promise<void> | void;
}

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: { continuation_prompt: string; confirm_state_loss: boolean },
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: {
      reload?: () => Promise<void>;
      isIdle?: () => boolean;
      ui?: {
        notify?: (message: string, level: "info" | "warning" | "error") => void;
        setEditorText?: (text: string) => void;
      };
    },
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

interface FakeCommandContext {
  reload: () => Promise<void>;
  ui?: { notify: (message: string, level: string) => void };
}

async function loadExtension() {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const sentUserMessages: Array<{ content: string; options?: { deliverAs?: string } }> = [];
  const handlers = new Map<string, Array<(...args: never[]) => unknown>>();

  const fakePi = {
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage(content: string, options?: { deliverAs?: string }) {
      sentUserMessages.push({ content, options });
    },
    on(name: string, handler: (...args: never[]) => unknown) {
      const existing = handlers.get(name) ?? [];
      existing.push(handler);
      handlers.set(name, existing);
    },
  };

  await extension(fakePi as never);

  return { commands, tools, sentUserMessages, handlers };
}

test("registers pi_extension_dev_reload_self tool and internal command", async () => {
  const { commands, tools } = await loadExtension();

  assert.ok(commands.has("pi-reload-self-run"));
  assert.ok(tools.has("pi_extension_dev_reload_self"));
  assert.match(
    tools.get("pi_extension_dev_reload_self")?.description ?? "",
    /reset extension\/module in-memory state/,
  );
});

test("tool refuses to queue reload without explicit state loss confirmation", async () => {
  const { tools, sentUserMessages } = await loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const result = await tool.execute("tool-1", {
    continuation_prompt: "continue after reload",
    confirm_state_loss: false,
  });

  assert.equal(sentUserMessages.length, 0);
  assert.match(result.content[0]?.text ?? "", /confirm_state_loss: true/);
});

test("tool schedules reload after runtime exposes reload on tool context", async () => {
  const { tools, sentUserMessages, handlers } = await loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const events: string[] = [];
  const result = await tool.execute(
    "tool-1",
    {
      continuation_prompt: "  continue after reload  ",
      confirm_state_loss: true,
    },
    undefined,
    undefined,
    {
      reload: async () => {
        events.push("reload");
      },
    },
  );

  assert.deepEqual(events, []);
  assert.deepEqual(sentUserMessages, []);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ["reload"]);
  await handlers.get("session_start")?.[0]?.({} as never, {} as never);
  assert.deepEqual(sentUserMessages, [
    { content: "continue after reload", options: { deliverAs: "followUp" } },
  ]);
  assert.match(result.content[0]?.text ?? "", /after the current response finishes/);
});

test("tool waits for idle before scheduled reload", async () => {
  const { tools, sentUserMessages, handlers } = await loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const events: string[] = [];
  let idle = false;
  const result = await tool.execute(
    "tool-1",
    {
      continuation_prompt: "continue after reload",
      confirm_state_loss: true,
    },
    undefined,
    undefined,
    {
      isIdle: () => idle,
      reload: async () => {
        events.push("reload");
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, []);
  idle = true;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(events, ["reload"]);
  await handlers.get("session_start")?.[0]?.({} as never, {} as never);
  assert.deepEqual(sentUserMessages, [
    { content: "continue after reload", options: { deliverAs: "followUp" } },
  ]);
  assert.match(result.content[0]?.text ?? "", /after the current response finishes/);
});

test("tool provides manual command when tool context cannot reload", async () => {
  const { tools, sentUserMessages } = await loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const editorTexts: string[] = [];
  const result = await tool.execute(
    "tool-1",
    {
      continuation_prompt: "  continue after reload  ",
      confirm_state_loss: true,
    },
    undefined,
    undefined,
    {
      ui: {
        setEditorText: (text) => {
          editorTexts.push(text);
        },
      },
    },
  );

  assert.deepEqual(sentUserMessages, []);
  assert.equal(editorTexts.length, 1);
  assert.match(editorTexts[0] ?? "", /^\/pi-reload-self-run [A-Za-z0-9_-]+$/);
  assert.match(result.content[0]?.text ?? "", /cannot execute ctx\.reload\(\) directly/);
});

test("internal command reports invalid payload without reloading", async () => {
  const { commands, sentUserMessages } = await loadExtension();
  const command = commands.get("pi-reload-self-run");
  assert.ok(command);

  const events: string[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  await command.handler("not valid !!!", {
    reload: async () => {
      events.push("reload");
    },
    ui: {
      notify: (message, level) => {
        notifications.push({ message, level });
      },
    },
  });

  assert.deepEqual(events, []);
  assert.deepEqual(sentUserMessages, []);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Invalid reload payload/);
  assert.equal(notifications[0]?.level, "error");
});

test("internal command handles invalid payload when ui is unavailable", async () => {
  const { commands } = await loadExtension();
  const command = commands.get("pi-reload-self-run");
  assert.ok(command);

  await assert.doesNotReject(async () => {
    await command.handler("not valid !!!", {
      reload: async () => {
        throw new Error("reload should not run");
      },
    });
  });
});

test("internal command reloads then sends continuation prompt", async () => {
  const { commands, tools, sentUserMessages, handlers } = await loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  const command = commands.get("pi-reload-self-run");
  assert.ok(tool);
  assert.ok(command);

  const editorTexts: string[] = [];
  await tool.execute(
    "tool-1",
    {
      continuation_prompt: "continue after reload",
      confirm_state_loss: true,
    },
    undefined,
    undefined,
    {
      ui: {
        setEditorText: (text) => {
          editorTexts.push(text);
        },
      },
    },
  );
  const payload = editorTexts[0]?.replace("/pi-reload-self-run ", "") ?? "";

  const events: string[] = [];
  await command.handler(payload, {
    reload: async () => {
      events.push("reload");
    },
  });

  assert.deepEqual(events, ["reload"]);
  assert.deepEqual(sentUserMessages, []);
  await handlers.get("session_start")?.[0]?.({} as never, {} as never);
  assert.deepEqual(sentUserMessages, [
    { content: "continue after reload", options: { deliverAs: "followUp" } },
  ]);
});

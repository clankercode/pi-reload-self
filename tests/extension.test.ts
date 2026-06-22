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
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

interface FakeCommandContext {
  reload: () => Promise<void>;
  ui?: { notify: (message: string, level: string) => void };
}

function loadExtension() {
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const sentUserMessages: Array<{ content: string; options?: { deliverAs?: string } }> = [];

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
  };

  extension(fakePi as never);

  return { commands, tools, sentUserMessages };
}

test("registers pi_extension_dev_reload_self tool and internal command", () => {
  const { commands, tools } = loadExtension();

  assert.ok(commands.has("pi-reload-self-run"));
  assert.ok(tools.has("pi_extension_dev_reload_self"));
  assert.match(
    tools.get("pi_extension_dev_reload_self")?.description ?? "",
    /reset extension\/module in-memory state/,
  );
});

test("tool refuses to queue reload without explicit state loss confirmation", async () => {
  const { tools, sentUserMessages } = loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const result = await tool.execute("tool-1", {
    continuation_prompt: "continue after reload",
    confirm_state_loss: false,
  });

  assert.equal(sentUserMessages.length, 0);
  assert.match(result.content[0]?.text ?? "", /confirm_state_loss: true/);
});

test("tool queues internal command with encoded continuation payload", async () => {
  const { tools, sentUserMessages } = loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  assert.ok(tool);

  const result = await tool.execute("tool-1", {
    continuation_prompt: "  continue after reload  ",
    confirm_state_loss: true,
  });

  assert.equal(sentUserMessages.length, 1);
  assert.match(sentUserMessages[0]?.content ?? "", /^\/pi-reload-self-run [A-Za-z0-9_-]+$/);
  assert.deepEqual(sentUserMessages[0]?.options, { deliverAs: "followUp" });
  assert.match(result.content[0]?.text ?? "", /queued/);
});

test("internal command reloads then sends continuation prompt", async () => {
  const { commands, tools, sentUserMessages } = loadExtension();
  const tool = tools.get("pi_extension_dev_reload_self");
  const command = commands.get("pi-reload-self-run");
  assert.ok(tool);
  assert.ok(command);

  await tool.execute("tool-1", {
    continuation_prompt: "continue after reload",
    confirm_state_loss: true,
  });
  const payload = sentUserMessages[0]?.content.replace("/pi-reload-self-run ", "") ?? "";
  sentUserMessages.length = 0;

  const events: string[] = [];
  await command.handler(payload, {
    reload: async () => {
      events.push("reload");
    },
  });

  assert.deepEqual(events, ["reload"]);
  assert.deepEqual(sentUserMessages, [
    { content: "continue after reload", options: { deliverAs: "followUp" } },
  ]);
});

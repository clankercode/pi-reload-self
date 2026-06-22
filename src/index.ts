import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  decodeReloadPayload,
  encodeReloadPayload,
  extractReloadPayloadToken,
  validateContinuationPrompt,
} from "./payload.ts";

const COMMAND_NAME = "pi-reload-self-run";
const TOOL_NAME = "pi_extension_dev_reload_self";

interface RuntimeReloadContext {
  reload?: () => Promise<void>;
  ui?: {
    setEditorText?: (text: string) => void;
  };
}

export default function reloadSelfExtension(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "Internal command used by pi_extension_dev_reload_self to reload Pi and continue",
    handler: async (args, ctx) => {
      let continuationPrompt: string;

      try {
        continuationPrompt = decodeReloadPayload(extractReloadPayloadToken(args, COMMAND_NAME)).continuationPrompt;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui?.notify(`pi-reload-self: ${message}`, "error");
        return;
      }

      await ctx.reload();
      pi.sendUserMessage(continuationPrompt, { deliverAs: "followUp" });
    },
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Reload Pi and Continue",
    description:
      "Reload Pi extensions, skills, prompts, and themes, then continue with a provided prompt. WARNING: reload may reset extension/module in-memory state, hot-loaded resources, and other extension-maintained runtime state. Only call this when the user requested a reload or extension development changes require it. Requires confirm_state_loss: true.",
    promptSnippet:
      "Reload Pi extensions/resources and continue afterward; requires explicit state-loss confirmation.",
    promptGuidelines: [
      "Use pi_extension_dev_reload_self only when the user explicitly asks to reload Pi or when extension development changes need to be reloaded.",
      "Before calling pi_extension_dev_reload_self, set confirm_state_loss to true only if you accept that reload may reset extension/module in-memory state and extension-maintained runtime state.",
    ],
    parameters: Type.Object({
      continuation_prompt: Type.String({
        description: "Non-empty prompt to send to the agent after Pi reloads.",
      }),
      confirm_state_loss: Type.Boolean({
        description:
          "Must be true. Confirms acceptance that reload can reset extension/module in-memory state and extension-maintained runtime state.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!params.confirm_state_loss) {
        return {
          content: [
            {
              type: "text",
              text:
                "Reload not queued. pi_extension_dev_reload_self requires confirm_state_loss: true because reload may reset extension/module in-memory state and extension-maintained runtime state.",
            },
          ],
          details: { queued: false, reason: "missing-confirmation" },
        };
      }

      const continuationPrompt = validateContinuationPrompt(params.continuation_prompt);
      const payload = encodeReloadPayload({ continuationPrompt });
      const command = `/${COMMAND_NAME} ${payload}`;
      const runtimeCtx = ctx as RuntimeReloadContext;

      if (typeof runtimeCtx.reload === "function") {
        await runtimeCtx.reload();
        pi.sendUserMessage(continuationPrompt, { deliverAs: "followUp" });

        return {
          content: [
            {
              type: "text",
              text:
                "Pi reloaded. The provided continuation prompt has been sent as a follow-up user message.",
            },
          ],
          details: { queued: true, reason: "reloaded-directly" },
        };
      }

      runtimeCtx.ui?.setEditorText?.(command);

      return {
        content: [
          {
            type: "text",
            text:
              `Pi tool contexts in this Pi version cannot execute ctx.reload() directly. Submit this command to reload and continue: ${command}`,
          },
        ],
        details: { queued: false, reason: "manual-command-required" },
      };
    },
  });
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  decodeReloadPayload,
  encodeReloadPayload,
  validateContinuationPrompt,
} from "./payload.ts";

const COMMAND_NAME = "pi-reload-self-run";
const TOOL_NAME = "pi_extension_dev_reload_self";

export default function reloadSelfExtension(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAME, {
    description: "Internal command used by pi_extension_dev_reload_self to reload Pi and continue",
    handler: async (args, ctx) => {
      let continuationPrompt: string;

      try {
        continuationPrompt = decodeReloadPayload(args.trim()).continuationPrompt;
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
    async execute(_toolCallId, params) {
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
      pi.sendUserMessage(`/${COMMAND_NAME} ${payload}`, { deliverAs: "followUp" });

      return {
        content: [
          {
            type: "text",
            text:
              "Pi reload queued. After reload, the provided continuation prompt will be sent as a follow-up user message.",
          },
        ],
        details: { queued: true, reason: "queued" },
      };
    },
  });
}

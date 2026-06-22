import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONTINUATION_SLOT = "__piReloadSelfContinuationPrompt";
const PATCH_SLOT = "__piReloadSelfExtensionContextReloadPatch";

interface ReloadSelfGlobalState {
  [CONTINUATION_SLOT]?: string;
  [PATCH_SLOT]?: boolean;
}

interface ReloadableContext {
  reload?: () => Promise<void>;
}

interface ExtensionRunnerPrototype {
  createContext: (this: ExtensionRunnerInstance) => object;
}

interface ExtensionRunnerInstance {
  assertActive?: () => void;
  reloadHandler?: () => Promise<void>;
}

function globalState(): ReloadSelfGlobalState {
  return globalThis as ReloadSelfGlobalState;
}

export function storeContinuationPrompt(prompt: string): void {
  globalState()[CONTINUATION_SLOT] = prompt;
}

export function takeContinuationPrompt(): string | undefined {
  const state = globalState();
  const prompt = state[CONTINUATION_SLOT];
  delete state[CONTINUATION_SLOT];
  return prompt;
}

export async function installToolContextReloadPatch(): Promise<boolean> {
  const state = globalState();
  if (state[PATCH_SLOT]) return true;

  try {
    const packageEntryUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
    const packageDistDir = dirname(fileURLToPath(packageEntryUrl));
    const runnerUrl = pathToFileURL(join(packageDistDir, "core/extensions/runner.js")).href;
    const module = (await import(runnerUrl)) as {
      ExtensionRunner?: { prototype?: ExtensionRunnerPrototype };
    };
    const prototype = module.ExtensionRunner?.prototype;
    if (!prototype || typeof prototype.createContext !== "function") {
      return false;
    }

    const originalCreateContext = prototype.createContext;
    prototype.createContext = function patchedCreateContext(this: ExtensionRunnerInstance) {
      const context = originalCreateContext.call(this) as ReloadableContext;
      if (typeof context.reload !== "function") {
        context.reload = async () => {
          this.assertActive?.();
          if (typeof this.reloadHandler !== "function") {
            throw new Error("Pi reload handler is unavailable");
          }
          await this.reloadHandler();
        };
      }
      return context;
    };

    state[PATCH_SLOT] = true;
    return true;
  } catch {
    return false;
  }
}

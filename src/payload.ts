export interface ReloadPayload {
  continuationPrompt: string;
}

const INVALID_PAYLOAD_MESSAGE = "Invalid reload payload";
const INVALID_PROMPT_MESSAGE = "continuation_prompt must be a non-empty string";

export function validateContinuationPrompt(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(INVALID_PROMPT_MESSAGE);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(INVALID_PROMPT_MESSAGE);
  }

  return trimmed;
}

export function encodeReloadPayload(payload: ReloadPayload): string {
  const normalized: ReloadPayload = {
    continuationPrompt: validateContinuationPrompt(payload.continuationPrompt),
  };

  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

export function decodeReloadPayload(encoded: string): ReloadPayload {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error("Payload is not base64url");
    }

    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Payload is not an object");
    }

    const continuationPrompt = validateContinuationPrompt(
      (parsed as { continuationPrompt?: unknown }).continuationPrompt,
    );

    return { continuationPrompt };
  } catch (error) {
    throw new Error(INVALID_PAYLOAD_MESSAGE, { cause: error });
  }
}

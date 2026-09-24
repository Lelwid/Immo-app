export type OpenAiHttpErrorKind = "api" | "invalid_response" | "timeout";

export class OpenAiHttpError extends Error {
  kind: OpenAiHttpErrorKind;
  status?: number;
  responseBody?: unknown;

  constructor(kind: OpenAiHttpErrorKind, options: { cause?: unknown; responseBody?: unknown; status?: number } = {}) {
    super(`OPENAI_${kind.toUpperCase()}`);
    this.name = "OpenAiHttpError";
    this.kind = kind;
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.cause = options.cause;
  }
}

export async function requestOpenAiJson(
  body: unknown,
  apiKey: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new OpenAiHttpError("api", { responseBody: sanitizeOpenAiError(payload), status: response.status });
    }

    if (!payload || typeof payload !== "object") {
      throw new OpenAiHttpError("invalid_response", { status: response.status });
    }

    return payload;
  } catch (error) {
    if (error instanceof OpenAiHttpError) {
      throw error;
    }

    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new OpenAiHttpError("timeout", { cause: error });
    }

    throw new OpenAiHttpError("api", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeOpenAiError(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const error = source.error && typeof source.error === "object" ? source.error as Record<string, unknown> : source;

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    type: typeof error.type === "string" ? error.type : undefined,
  };
}

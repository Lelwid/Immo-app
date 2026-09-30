type RetryableError = Error & {
  cause?: unknown;
  code?: string | null;
  status?: number | null;
  statusText?: string | null;
};

type TransientRetryOptions = {
  delaysMs?: number[];
  onRetry?: (context: { attempt: number; delayMs: number; error: unknown; nextAttempt: number }) => void;
};

const defaultDelaysMs = [300, 900];
const retryableStatuses = new Set([408, 429, 502, 503, 504, 520, 521, 522, 523, 524]);
const retryableCodes = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003", "PGRSTX00", "57P01", "57P02", "57P03"]);
const transientMessagePattern = /failed to fetch|network ?error|network request failed|load failed|connection (?:reset|closed|refused)|timed? ?out|timeout|temporar(?:y|ily) unavailable|bad gateway|gateway timeout/i;

export async function withTransientRetry<T>(operation: () => Promise<T>, options: TransientRetryOptions = {}): Promise<T> {
  const delaysMs = options.delaysMs ?? defaultDelaysMs;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delaysMs[attempt - 1];

      if (delayMs === undefined || !isTransientDataError(error)) {
        throw error;
      }

      options.onRetry?.({ attempt, delayMs, error, nextAttempt: attempt + 1 });
      await wait(delayMs);
    }
  }
}

export function isTransientDataError(error: unknown): boolean {
  for (const candidate of walkErrorChain(error)) {
    const status = readNumber(candidate, "status");
    const code = readString(candidate, "code").toUpperCase();
    const name = readString(candidate, "name");
    const message = `${readString(candidate, "message")} ${readString(candidate, "statusText")}`;

    if (name === "AbortError") {
      return false;
    }

    if (status === 401 || status === 403 || code === "42501" || code.startsWith("PGRST3")) {
      return false;
    }

    if (retryableStatuses.has(status) || retryableCodes.has(code) || code.startsWith("08") || code.startsWith("53")) {
      return true;
    }

    if (transientMessagePattern.test(message)) {
      return true;
    }
  }

  return false;
}

export function getDataErrorDiagnostics(error: unknown) {
  for (const candidate of walkErrorChain(error)) {
    const code = readString(candidate, "code");
    const status = readNumber(candidate, "status");

    if (code || status) {
      return { code: code || null, status: status || null };
    }
  }

  return { code: null, status: null };
}

function walkErrorChain(error: unknown) {
  const chain: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  let current = error;

  while (current && typeof current === "object" && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    const candidate = current as RetryableError;
    chain.push(candidate as unknown as Record<string, unknown>);
    current = candidate.cause;
  }

  return chain;
}

function readNumber(candidate: Record<string, unknown>, key: string) {
  return typeof candidate[key] === "number" ? candidate[key] : 0;
}

function readString(candidate: Record<string, unknown>, key: string) {
  return typeof candidate[key] === "string" ? candidate[key] : "";
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

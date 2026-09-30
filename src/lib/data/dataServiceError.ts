export type DataServiceErrorMetadata = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
  statusText?: string | null;
};

export type DataServiceError = Error & DataServiceErrorMetadata & {
  cause?: unknown;
};

export function createDataServiceError(
  customerMessage: string,
  cause?: unknown,
  metadata: DataServiceErrorMetadata = {},
): DataServiceError {
  const causeMetadata = readErrorMetadata(cause);
  const technicalMessage = causeMetadata.message;
  const error = new Error(
    process.env.NODE_ENV === "development" && technicalMessage
      ? `${customerMessage} ${technicalMessage}`
      : customerMessage,
  ) as DataServiceError;

  error.name = "DataServiceError";
  error.cause = cause;
  error.code = metadata.code ?? causeMetadata.code;
  error.details = metadata.details ?? causeMetadata.details;
  error.hint = metadata.hint ?? causeMetadata.hint;
  error.status = metadata.status ?? causeMetadata.status;
  error.statusText = metadata.statusText ?? causeMetadata.statusText;
  return error;
}

function readErrorMetadata(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      code: null,
      details: null,
      hint: null,
      message: value instanceof Error ? value.message : "",
      status: null,
      statusText: null,
    };
  }

  const candidate = value as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    details: typeof candidate.details === "string" ? candidate.details : null,
    hint: typeof candidate.hint === "string" ? candidate.hint : null,
    message: typeof candidate.message === "string" ? candidate.message : value instanceof Error ? value.message : "",
    status: typeof candidate.status === "number" ? candidate.status : null,
    statusText: typeof candidate.statusText === "string" ? candidate.statusText : null,
  };
}

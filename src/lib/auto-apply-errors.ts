const TERMINAL_PATTERNS = [
  /Credential profile not found/i,
  /Missing saved credentials/i,
  /Missing active credential profile/i,
  /Profile .* no longer exists/i,
];

const CONNECTIVITY_PATTERNS = [
  /ERR_NAME_NOT_RESOLVED/i,
  /ERR_ADDRESS_UNREACHABLE/i,
  /ERR_CONNECTION_(TIMED_OUT|RESET|REFUSED|CLOSED)/i,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /\bENOTFOUND\b/i,
  /Navigation timeout/i,
  /net::/i,
  /Timeout .* exceeded/i,
];

const STALE_PATTERNS = [
  /The village changed after this proposal was generated/i,
  /The planner snapshot changed before execution/i,
  /Planner candidate is no longer actionable for the linked snapshot/i,
  /Regenerate it first/i,
];

const DETERMINISTIC_PATTERNS = [
  /captcha/i,
  /login/i,
  /anti-bot/i,
  /Travian no confirmó el inicio de la construcción/i,
  /Building slot \d+ was not found/i,
  /Resource field slot \d+ was not found/i,
  /No se encontró un botón directo para construir/i,
];

export type AutoApplyErrorKind =
  | "terminal"
  | "connectivity"
  | "stale"
  | "deterministic"
  | "retryable";

export class AutoApplyError extends Error {
  readonly kind: AutoApplyErrorKind;
  readonly code: string;
  readonly retryAfterMs: number | null;
  override readonly cause: unknown;

  constructor(input: {
    cause?: unknown;
    code: string;
    kind: AutoApplyErrorKind;
    message: string;
    retryAfterMs?: number | null;
  }) {
    super(input.message);
    this.name = "AutoApplyError";
    this.kind = input.kind;
    this.code = input.code;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.cause = input.cause;
  }
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown auto-apply failure.";

export const normalizeAutoApplyError = (
  error: unknown,
  fallbackCode = "AUTO_APPLY_UNKNOWN",
) => {
  if (error instanceof AutoApplyError) {
    return error;
  }

  const message = getErrorMessage(error);

  if (TERMINAL_PATTERNS.some((pattern) => pattern.test(message))) {
    return new AutoApplyError({
      cause: error,
      code: "AUTO_APPLY_TERMINAL",
      kind: "terminal",
      message,
    });
  }

  if (CONNECTIVITY_PATTERNS.some((pattern) => pattern.test(message))) {
    return new AutoApplyError({
      cause: error,
      code: "AUTO_APPLY_CONNECTIVITY",
      kind: "connectivity",
      message,
    });
  }

  if (STALE_PATTERNS.some((pattern) => pattern.test(message))) {
    return new AutoApplyError({
      cause: error,
      code: "AUTO_APPLY_STALE",
      kind: "stale",
      message,
    });
  }

  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(message))) {
    return new AutoApplyError({
      cause: error,
      code: "AUTO_APPLY_DETERMINISTIC",
      kind: "deterministic",
      message,
    });
  }

  return new AutoApplyError({
    cause: error,
    code: fallbackCode,
    kind: "retryable",
    message,
  });
};

export const isAutoApplyErrorKind = (
  error: unknown,
  kind: AutoApplyErrorKind,
): error is AutoApplyError => error instanceof AutoApplyError && error.kind === kind;

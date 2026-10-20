/** Stable machine-readable error codes returned in problem+json `code`. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'INVALID_CREDENTIALS',
  'CSRF_FAILED',
  'FORBIDDEN',
  'NO_ACTIVE_ORGANIZATION',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'EMAIL_TAKEN',
  'INVALID_TOKEN',
  'WORKFLOW_DENIED',
  'SUBMISSION_INCOMPLETE',
  'IDEMPOTENCY_KEY_REUSED',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
  /** Present on VERSION_CONFLICT: the server's current version. */
  currentVersion?: number;
  /** Present on WORKFLOW_DENIED / SUBMISSION_INCOMPLETE. */
  reasons?: string[];
}

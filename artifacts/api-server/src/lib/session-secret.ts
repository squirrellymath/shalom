const LEGACY_FALLBACK = "shalom-secret";
const MIN_SESSION_SECRET_LENGTH = 32;

export function validateSessionSecret(
  value: string | undefined,
  warn: (message: string) => void,
): string {
  if (!value) {
    throw new Error("SESSION_SECRET must be set before starting the API server.");
  }

  if (value === LEGACY_FALLBACK) {
    throw new Error(
      "SESSION_SECRET uses the disallowed legacy fallback; configure a unique secret before starting the API server.",
    );
  }

  if (value.length < MIN_SESSION_SECRET_LENGTH) {
    warn(
      "SESSION_SECRET is shorter than 32 characters; the server will start, but configure a stronger secret.",
    );
  }

  return value;
}
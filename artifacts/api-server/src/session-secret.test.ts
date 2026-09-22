import { describe, expect, it, vi } from "vitest";
import { validateSessionSecret } from "./lib/session-secret";

describe("SESSION_SECRET boot policy", () => {
  it("refuses the legacy fallback string", () => {
    const warn = vi.fn();

    expect(() => validateSessionSecret("shalom-secret", warn)).toThrow(
      "disallowed legacy fallback",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("allows a short secret to start and logs a warning", () => {
    const warn = vi.fn();
    const secret = "short-secret";

    expect(validateSessionSecret(secret, warn)).toBe(secret);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("shorter than 32 characters");
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
  });

  it("allows a valid secret to start without a warning", () => {
    const warn = vi.fn();
    const secret = "a-valid-session-secret-that-is-at-least-32-characters";

    expect(validateSessionSecret(secret, warn)).toBe(secret);
    expect(warn).not.toHaveBeenCalled();
  });
});
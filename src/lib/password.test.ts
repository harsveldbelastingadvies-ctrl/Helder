import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password security", () => {
  it("accepts the right password and rejects a wrong one", () => {
    const stored = hashPassword("Mijn veilige wachtwoord");
    expect(verifyPassword("Mijn veilige wachtwoord", stored)).toBe(true);
    expect(verifyPassword("Een ander wachtwoord", stored)).toBe(false);
  });

  it("never stores the readable password", () => {
    const stored = hashPassword("NietLeesbaar123!");
    expect(stored).not.toContain("NietLeesbaar123!");
  });
});

import { describe, expect, it } from "vitest";
import { displayPhone, normalizeBrazilianPhone } from "./phone.js";

describe("normalizeBrazilianPhone", () => {
  it("normalizes mobile numbers with country code", () => {
    expect(normalizeBrazilianPhone("+55 (92) 99999-9999")).toBe("5592999999999");
  });

  it("adds Brazil country code when it is missing", () => {
    expect(normalizeBrazilianPhone("(92) 99999-9999")).toBe("5592999999999");
  });

  it("rejects numbers outside the expected Brazilian length", () => {
    expect(normalizeBrazilianPhone("123")).toBeNull();
  });
});

describe("displayPhone", () => {
  it("formats normalized mobile numbers for users", () => {
    expect(displayPhone("5592999999999")).toBe("+55 (92) 99999-9999");
  });
});

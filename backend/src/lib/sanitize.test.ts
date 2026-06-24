import { describe, expect, it } from "vitest";
import { sanitizeMessage } from "./sanitize.js";

describe("sanitizeMessage", () => {
  it("removes control characters and trims whitespace", () => {
    expect(sanitizeMessage(" \u0000Oi\u0007\r\nTudo bem? ")).toBe("Oi\nTudo bem?");
  });
});

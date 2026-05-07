import { describe, it, expect } from "vitest";
import { maskProjectId, maskIp } from "./logger.js";

describe("maskProjectId", () => {
  it("masks a standard UUID", () => {
    const uuid = "9f8b1e2c-43a6-4d7f-9e0a-12bb3cc4dd55";
    expect(maskProjectId(uuid)).toBe("9f8b1e2c-…-dd55");
  });

  it("returns '-' for empty input", () => {
    expect(maskProjectId("")).toBe("-");
  });

  it("returns '-' for literal '-'", () => {
    expect(maskProjectId("-")).toBe("-");
  });

  it("masks the zero UUID", () => {
    expect(maskProjectId("00000000-0000-0000-0000-000000000000")).toBe("00000000-…-0000");
  });
});

describe("maskIp", () => {
  it("zeros the last octet of an IPv4 address", () => {
    expect(maskIp("192.168.1.42")).toBe("192.168.1.0");
  });

  it("returns '-' for empty input", () => {
    expect(maskIp("")).toBe("-");
  });

  it("masks an IPv6 address to the first 3 groups", () => {
    expect(maskIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8:85a3::");
  });

  it("handles compressed IPv6 notation", () => {
    expect(maskIp("2001:db8::8a2e:370:7334")).toBe("2001:db8:8a2e::");
  });

  it("handles IPv6 loopback", () => {
    expect(maskIp("::1")).toBe("1::");
  });
});

import { createHash } from "crypto";
import { checkHIBP } from "../hibp";

// Helper: compute the SHA-1 suffix for a given password (chars 5+)
function sha1Suffix(password: string): string {
  return createHash("sha1").update(password).digest("hex").toUpperCase().slice(5);
}

describe("checkHIBP", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns breached=true when password hash suffix is found with count >= threshold", async () => {
    const suffix = sha1Suffix("password");
    const mockBody = [
      "0000000000000000000000000000000AAAA:2",
      `${suffix}:9001`,
      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0",
    ].join("\n");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockBody),
    });

    const result = await checkHIBP("password");
    expect(result).toEqual({ breached: true, count: 9001 });
  });

  it("returns breached=false when password hash suffix is not found", async () => {
    const mockBody = [
      "0000000000000000000000000000000AAAA:5",
      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1",
    ].join("\n");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockBody),
    });

    const result = await checkHIBP("s3cur3-un1qu3-p@ss");
    expect(result).toEqual({ breached: false, count: 0 });
  });

  it("returns breached=false on fetch timeout (fail-open)", async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 10);
      });
    });

    const result = await checkHIBP("password", 3, 5);
    expect(result).toEqual({ breached: false, count: 0 });
  });

  it("returns breached=false on network error (fail-open)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));

    const result = await checkHIBP("password");
    expect(result).toEqual({ breached: false, count: 0 });
  });

  it("returns breached=false when API returns non-200 status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await checkHIBP("password");
    expect(result).toEqual({ breached: false, count: 0 });
  });
});

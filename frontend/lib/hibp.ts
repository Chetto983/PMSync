import { createHash } from "crypto";

export interface HIBPResult {
  breached: boolean;
  count: number;
}

/**
 * Check if a password has been exposed in known data breaches using the
 * Have I Been Pwned (HIBP) k-anonymity API.
 *
 * - SHA-1 hashes the password locally
 * - Sends only the first 5 characters of the hash to the API
 * - Compares the suffix against returned hashes
 * - Fail-open on any error (timeout, network, non-200)
 *
 * @param password    The plaintext password to check
 * @param threshold   Minimum breach count to consider "breached" (default 3)
 * @param timeoutMs   Request timeout in milliseconds (default 3000)
 */
export async function checkHIBP(
  password: string,
  threshold = 3,
  timeoutMs = 3000,
): Promise<HIBPResult> {
  try {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!response.ok) {
      return { breached: false, count: 0 };
    }

    const text = await response.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10);
        return { breached: count >= threshold, count };
      }
    }

    return { breached: false, count: 0 };
  } catch {
    // Fail-open: on any error (timeout, network, etc.), allow the password
    return { breached: false, count: 0 };
  }
}

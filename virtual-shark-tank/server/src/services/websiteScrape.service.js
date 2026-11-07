import dns from "node:dns/promises";

// ─── SSRF guard ────────────────────────────────────────────
// MCA ingestion stores domains WITHOUT a scheme ("infosys.com").
// Every entry point normalizes to https:// before parsing.
// Do NOT remove the normalization — the vast majority of the
// 2,870 enriched businesses have scheme-less URLs.

const BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;

export function normalizeUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("Empty URL");
  }
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Reject anything with a scheme we don't support (ftp:, file:, javascript:)
  // before prepending https:// — otherwise "ftp://x.com" becomes "https://ftp://x.com"
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new Error(`Unsupported URL scheme: ${trimmed.split(":")[0]}`);
  }
  return `https://${trimmed}`;
}

export function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isBlockedIPv4(ip) {
  const target = ipv4ToInt(ip);
  return BLOCKED_CIDRS.some((cidr) => {
    const [base, bits] = cidr.split("/");
    const mask = ~((1 << (32 - Number(bits))) - 1) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

export function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  return false;
}

async function assertSafeHost(hostname) {
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  const v4Addrs = v4.status === "fulfilled" ? v4.value : [];
  const v6Addrs = v6.status === "fulfilled" ? v6.value : [];

  if (v4Addrs.length === 0 && v6Addrs.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  for (const ip of v4Addrs) {
    if (isBlockedIPv4(ip)) {
      throw new Error(`Hostname resolves to blocked IP ${ip}`);
    }
  }
  for (const ip of v6Addrs) {
    if (isBlockedIPv6(ip)) {
      throw new Error(`Hostname resolves to blocked IPv6 ${ip}`);
    }
  }
}

// ─── Fetch with SSRF protection ────────────────────────────

export async function fetchSafe(rawUrl) {
  const startUrl = normalizeUrl(rawUrl);
  const parsed = new URL(startUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }
  await assertSafeHost(parsed.hostname);

  let currentUrl = startUrl;

  for (let hop = 0; hop < 3; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "SmartSharkBot/1.0 (+https://smartshark.example/bot)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    // Redirect — re-validate every hop
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect with no Location header");
      const next = new URL(location, currentUrl);
      if (!["http:", "https:"].includes(next.protocol)) {
        throw new Error("Redirect to non-http(s) URL");
      }
      await assertSafeHost(next.hostname);
      currentUrl = next.toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${currentUrl}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    // Stream with hard size cap — a malicious server could stream
    // indefinitely and exhaust memory otherwise.
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        reader.cancel();
        throw new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }

    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  }

  throw new Error("Too many redirects");
}

// ─── Text extraction ───────────────────────────────────────

export function extractReadableText(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > 4000) text = text.slice(0, 4000) + "…";
  return text;
}

export async function scrapeWebsite(url) {
  const html = await fetchSafe(url);
  const text = extractReadableText(html);
  return { url,html, text, charCount: text.length };
}
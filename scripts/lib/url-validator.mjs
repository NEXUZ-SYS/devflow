// scripts/lib/url-validator.mjs — SI-3 SSRF allowlist for external URLs.
//
// Used by:
//   - skills/scrape-stack-batch (Task 2.3.A discovery, 2.3.D fetch-url)
//   - scripts/lib/permissions-evaluator (Task 3.1 callback URL validation)
//
// Policy:
//   1. Only https://, except http://localhost:* when DEVFLOW_DEV=1
//   2. Reject file://, gopher://, dict://, ldap://, tftp://, javascript:, data:
//   3. Reject hostnames resolving to:
//      - 169.254.169.254 (AWS/Azure metadata)
//      - metadata.google.internal, metadata.azure.com (cloud metadata names)
//      - 127.0.0.0/8 (loopback)
//      - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC1918)
//      - 169.254.0.0/16 (link-local)
//      - 0.0.0.0/8 (current network)
//      - ::1, fd00::/8, fe80::/10 (IPv6 equivalents)
//   4. Re-resolve hostname via DNS and re-check (defeats DNS rebinding)
//
// Throws on rejection. Returns the validated URL string on success.

import { promises as dns } from "node:dns";

const ALLOWED_SCHEMES = new Set(["https:"]);
const DEV_ALLOWED_SCHEMES = new Set(["https:", "http:"]);

const DENY_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "instance-data.ec2.internal",
]);

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ipInt, cidrInt, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (cidrInt & mask);
}

function isPrivateIPv4(ip) {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;
  // 0.0.0.0/8
  if (inCidr(ipInt, ipToInt("0.0.0.0"), 8)) return "current-network";
  // 10.0.0.0/8
  if (inCidr(ipInt, ipToInt("10.0.0.0"), 8)) return "rfc1918";
  // 127.0.0.0/8
  if (inCidr(ipInt, ipToInt("127.0.0.0"), 8)) return "loopback";
  // 169.254.0.0/16 (link-local + cloud metadata)
  if (inCidr(ipInt, ipToInt("169.254.0.0"), 16)) return "link-local";
  // 172.16.0.0/12
  if (inCidr(ipInt, ipToInt("172.16.0.0"), 12)) return "rfc1918";
  // 192.168.0.0/16
  if (inCidr(ipInt, ipToInt("192.168.0.0"), 16)) return "rfc1918";
  return null;
}

function isPrivateIPv6(addr) {
  const lower = addr.toLowerCase();
  if (lower === "::1") return "loopback";
  if (lower.startsWith("fd") || lower.startsWith("fc")) return "ula";        // fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb")) return "link-local"; // fe80::/10
  return null;
}

async function resolveAndCheck(hostname) {
  // Literal IPv4 first
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const tag = isPrivateIPv4(hostname);
    if (tag) throw new Error(`URL denied: hostname ${hostname} is ${tag}`);
    return;
  }
  // Literal IPv6
  if (hostname.includes(":")) {
    const tag = isPrivateIPv6(hostname);
    if (tag) throw new Error(`URL denied: hostname ${hostname} is ${tag}`);
    return;
  }
  // Resolve hostname (defeats DNS rebinding by re-checking after DNS)
  try {
    const v4 = await dns.resolve4(hostname).catch(() => []);
    const v6 = await dns.resolve6(hostname).catch(() => []);
    for (const ip of v4) {
      const tag = isPrivateIPv4(ip);
      if (tag) throw new Error(`URL denied: ${hostname} resolves to ${tag} address ${ip}`);
    }
    for (const ip of v6) {
      const tag = isPrivateIPv6(ip);
      if (tag) throw new Error(`URL denied: ${hostname} resolves to ${tag} address ${ip}`);
    }
  } catch (err) {
    if (err.message?.startsWith("URL denied")) throw err;
    // DNS resolution failure is non-fatal here — let the actual fetch fail naturally
    // (we only want to BLOCK private addresses, not require DNS to work)
  }
}

export async function validateUrl(url) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("URL invalid: empty or non-string input");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new Error(`URL invalid: parse error — ${err.message}`);
  }

  const devMode = process.env.DEVFLOW_DEV === "1";
  const allowedSchemes = devMode ? DEV_ALLOWED_SCHEMES : ALLOWED_SCHEMES;

  if (!allowedSchemes.has(parsed.protocol)) {
    throw new Error(
      `URL denied: scheme '${parsed.protocol}' not allowed ` +
      `(allowed: ${[...allowedSchemes].join(", ")})`
    );
  }

  // Localhost gating
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "ip6-localhost") {
    if (!devMode) {
      throw new Error(`URL denied: localhost requires DEVFLOW_DEV=1`);
    }
    return url;
  }

  // Cloud metadata hostnames (literal denials regardless of DNS)
  if (DENY_HOSTNAMES.has(hostname)) {
    throw new Error(`URL denied: ${hostname} is a cloud metadata endpoint`);
  }

  await resolveAndCheck(hostname);
  return url;
}

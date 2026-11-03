import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { IncomingMessage } from "node:http";
import {
  isPublicFeedUrl, RSS_MAX_BYTES, RSS_TIMEOUT_MS, type RssResponse
} from "../modules/collection/rss-capture.js";

const blocked = new BlockList();
for (const [network, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blocked.addSubnet(network, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export const isPublicRssAddress = (address: string): boolean => {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") :
    family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
};

// Validate the addresses returned to this connection, not a separate preflight lookup.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true, verbatim: true }).then(addresses => {
    if (!addresses.length || addresses.some(entry => !isPublicRssAddress(entry.address))) {
      callback(new Error("RSS destination resolved to a non-public address."), "");
      return;
    }
    const candidates = options.family
      ? addresses.filter(entry => entry.family === options.family) : addresses;
    const first = candidates[0];
    if (!first) callback(new Error("RSS destination has no address for this family."), "");
    else if (options.all) callback(null, candidates);
    else callback(null, first.address, first.family);
  }, error => callback(error instanceof Error ? error : new Error("RSS DNS lookup failed."), ""));
};

export const rssRedirect = (current: string, location: string, original: string): string => {
  const target = new URL(location, current).href;
  if (!isPublicFeedUrl(target) || new URL(target).origin !== new URL(original).origin) {
    throw new Error("RSS redirect must remain on the selected feed's HTTPS origin.");
  }
  return target;
};

export const readRssBytes = async (
  body: AsyncIterable<Uint8Array>, contentLength?: string
): Promise<Buffer> => {
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > RSS_MAX_BYTES)) {
    throw new Error("RSS response exceeds the byte limit or has invalid Content-Length.");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.byteLength;
    if (length > RSS_MAX_BYTES) throw new Error("RSS response exceeds the byte limit.");
    chunks.push(Buffer.from(chunk));
  }
  if (contentLength && Number(contentLength) !== length) throw new Error("RSS response was truncated.");
  return Buffer.concat(chunks);
};

const getResponse = (url: string, signal: AbortSignal, accept: string): Promise<IncomingMessage> =>
  new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", signal, lookup: publicLookup, agent: false,
      headers: {
        accept,
        "accept-encoding": "identity", "user-agent": "EvidenceMemo-RSS/1.0"
      }
    }, resolve);
    req.on("error", reject);
    req.end();
  });

export const fetchRssFeed = async (
  url: string, requestedAt = new Date().toISOString(),
  accept = "application/rss+xml, application/xml, text/xml"
): Promise<{ raw: Buffer; response: RssResponse }> => {
  if (!isPublicFeedUrl(url)) throw new Error("RSS requires a public HTTPS feed URL.");
  const signal = AbortSignal.timeout(RSS_TIMEOUT_MS);
  const redirects: string[] = [];
  let current = url;
  for (;;) {
    const response = await getResponse(current, signal, accept);
    try {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (redirects.length >= 3 || !response.headers.location) {
          throw new Error("RSS redirect limit exceeded or Location is missing.");
        }
        current = rssRedirect(current, response.headers.location, url);
        redirects.push(current);
        continue;
      }
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding !== "identity") throw new Error("Compressed RSS responses are unsupported.");
      const raw = await readRssBytes(response, response.headers["content-length"]);
      return {
        raw,
        response: {
          requestedAt, receivedAt: new Date().toISOString(), finalUrl: current,
          redirects, httpStatus: status, mediaType: response.headers["content-type"] ?? "",
          etag: response.headers.etag ?? null,
          lastModified: response.headers["last-modified"] ?? null
        }
      };
    } finally { response.destroy(); }
  }
};

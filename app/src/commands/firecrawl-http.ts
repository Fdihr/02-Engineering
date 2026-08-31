import {
  FIRECRAWL_CLIENT_TIMEOUT_MS,
  FIRECRAWL_MAX_RESPONSE_BYTES,
  FIRECRAWL_SCRAPE_ENDPOINT,
  type FirecrawlScrapeRequest
} from "../modules/retrieval/firecrawl-retrieval.js";

export type FirecrawlHttpResponse = {
  status: number;
  statusText: string;
  mediaType: string;
  rawBody: Buffer;
};

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const readBoundedBody = async (response: Response): Promise<Buffer> => {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > FIRECRAWL_MAX_RESPONSE_BYTES) {
      throw new Error(
        `Firecrawl response exceeds ${FIRECRAWL_MAX_RESPONSE_BYTES} bytes.`
      );
    }
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > FIRECRAWL_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(
        `Firecrawl response exceeds ${FIRECRAWL_MAX_RESPONSE_BYTES} bytes.`
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
};

export const requestFirecrawlScrape = async (
  apiKey: string,
  request: FirecrawlScrapeRequest,
  fetchImplementation: FetchImplementation = fetch
): Promise<FirecrawlHttpResponse> => {
  const response = await fetchImplementation(FIRECRAWL_SCRAPE_ENDPOINT, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(FIRECRAWL_CLIENT_TIMEOUT_MS),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
  return {
    status: response.status,
    statusText: response.statusText,
    mediaType: response.headers.get("content-type") ?? "unknown",
    rawBody: await readBoundedBody(response)
  };
};
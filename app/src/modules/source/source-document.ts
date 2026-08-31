import { createHash } from "node:crypto";
import type {
  CapturedSourceContent,
  SourceAnchor,
  SourceArtifactLineage,
  SourceDocument,
  SourceSegment
} from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";

export const SOURCE_DOCUMENT_SCHEMA_VERSION = "source-document-v1" as const;
export const SOURCE_NORMALIZATION_VERSION = "source-normalization-v1" as const;
export const MAX_SOURCE_SEGMENT_UTF8_BYTES = 4096;

export type SourceDocumentError =
  | "INVALID_SOURCE_CONTENT"
  | "EMPTY_SOURCE_CONTENT"
  | "INVALID_SOURCE_ARTIFACT_SHA256"
  | "INVALID_SOURCE_DOCUMENT"
  | "SOURCE_DOCUMENT_MISMATCH";

export type SourceAnchorError =
  | SourceDocumentError
  | "INVALID_SOURCE_ANCHOR"
  | "SOURCE_DOCUMENT_ID_MISMATCH"
  | "SOURCE_DOCUMENT_ARTIFACT_MISMATCH"
  | "SOURCE_SEGMENT_NOT_FOUND"
  | "SOURCE_SEGMENT_SHA256_MISMATCH"
  | "SOURCE_QUOTE_OUT_OF_RANGE"
  | "SOURCE_QUOTE_MISMATCH";

type SourceSegmentKind = SourceSegment["kind"];

type TextBlock = {
  text: string;
  startCharacter: number;
  kind: SourceSegmentKind;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const validSha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const normalizeSourceText = (value: string): string =>
  value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const readLineage = (value: unknown): SourceArtifactLineage[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const lineage: SourceArtifactLineage[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const artifactRef = nonEmptyString(entry.artifactRef);
    const artifactSha256 = validSha256(entry.artifactSha256);
    if (!artifactRef || !artifactSha256) {
      return undefined;
    }
    lineage.push({ artifactRef, artifactSha256 });
  }
  return lineage;
};

const readCapturedSource = (
  value: unknown
): Result<CapturedSourceContent, SourceDocumentError> => {
  if (!isRecord(value)) {
    return err("INVALID_SOURCE_CONTENT");
  }

  const runId = nonEmptyString(value.runId);
  const sourceItemId = nonEmptyString(value.sourceItemId);
  const body = nonEmptyString(value.body);
  const sourceArtifactRef = nonEmptyString(value.sourceArtifactRef);
  const sourceArtifactSha256 = validSha256(value.sourceArtifactSha256);
  const lineageArtifactRefs = readLineage(value.lineageArtifactRefs);
  if (!body) {
    return err("EMPTY_SOURCE_CONTENT");
  }
  if (!sourceArtifactSha256) {
    return err("INVALID_SOURCE_ARTIFACT_SHA256");
  }
  if (
    !runId ||
    !sourceItemId ||
    (value.sourceKind !== "provider-captured" &&
      value.sourceKind !== "retrieved-publisher") ||
    (value.contentFormat !== "markdown" && value.contentFormat !== "plain-text") ||
    !sourceArtifactRef ||
    !lineageArtifactRefs
  ) {
    return err("INVALID_SOURCE_CONTENT");
  }

  return ok({
    runId,
    sourceItemId,
    sourceKind: value.sourceKind,
    contentFormat: value.contentFormat,
    body,
    sourceArtifactRef,
    sourceArtifactSha256,
    lineageArtifactRefs
  });
};

const structuralKind = (line: string): SourceSegmentKind | undefined => {
  if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) {
    return "heading";
  }
  if (/^\s*>/.test(line)) {
    return "quote";
  }
  if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
    return "list-item";
  }
  if (/^\s*\|.*\|\s*$/.test(line)) {
    return "table-row";
  }
  if (/^\s*```/.test(line)) {
    return "other";
  }
  return undefined;
};

const createTextBlocks = (normalizedText: string): TextBlock[] => {
  const lines = normalizedText.split("\n");
  const blocks: TextBlock[] = [];
  let lineStart = 0;
  let paragraphStart: number | undefined;
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphStart !== undefined && paragraphLines.length > 0) {
      blocks.push({
        text: paragraphLines.join("\n"),
        startCharacter: paragraphStart,
        kind: "paragraph"
      });
    }
    paragraphStart = undefined;
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      flushParagraph();
    } else {
      const kind = structuralKind(line);
      if (kind) {
        flushParagraph();
        blocks.push({ text: line, startCharacter: lineStart, kind });
      } else {
        paragraphStart ??= lineStart;
        paragraphLines.push(line);
      }
    }
    lineStart += line.length + (index < lines.length - 1 ? 1 : 0);
  }
  flushParagraph();
  return blocks;
};

const splitBlock = (block: TextBlock): TextBlock[] => {
  if (Buffer.byteLength(block.text, "utf8") <= MAX_SOURCE_SEGMENT_UTF8_BYTES) {
    return [block];
  }

  const chunks: TextBlock[] = [];
  let chunk = "";
  let chunkBytes = 0;
  let chunkStart = 0;
  let consumedCharacters = 0;

  for (const character of block.text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (chunk && chunkBytes + characterBytes > MAX_SOURCE_SEGMENT_UTF8_BYTES) {
      chunks.push({
        text: chunk,
        startCharacter: block.startCharacter + chunkStart,
        kind: block.kind
      });
      chunkStart = consumedCharacters;
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
    consumedCharacters += character.length;
  }

  if (chunk) {
    chunks.push({
      text: chunk,
      startCharacter: block.startCharacter + chunkStart,
      kind: block.kind
    });
  }
  return chunks;
};

const createSegments = (
  normalizedText: string,
  documentId: string
): SourceSegment[] =>
  createTextBlocks(normalizedText)
    .flatMap(splitBlock)
    .map((block, ordinal) => {
      const textSha256 = sha256(block.text);
      const startUtf8Byte = Buffer.byteLength(
        normalizedText.slice(0, block.startCharacter),
        "utf8"
      );
      const endUtf8Byte = startUtf8Byte + Buffer.byteLength(block.text, "utf8");
      return {
        id: `source-segment-${sha256(
          `${SOURCE_NORMALIZATION_VERSION}\n${documentId}\n${ordinal}\n${textSha256}`
        )}`,
        ordinal,
        kind: block.kind,
        text: block.text,
        textSha256,
        startUtf8Byte,
        endUtf8Byte
      };
    });

export const createSourceDocument = (
  value: unknown
): Result<SourceDocument, SourceDocumentError> => {
  const captured = readCapturedSource(value);
  if (!captured.ok) {
    return captured;
  }

  const normalizedText = normalizeSourceText(captured.value.body);
  if (!normalizedText.trim()) {
    return err("EMPTY_SOURCE_CONTENT");
  }
  const normalizedTextSha256 = sha256(normalizedText);
  const identity = JSON.stringify({
    schemaVersion: SOURCE_DOCUMENT_SCHEMA_VERSION,
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    runId: captured.value.runId,
    sourceItemId: captured.value.sourceItemId,
    sourceKind: captured.value.sourceKind,
    inputFormat: captured.value.contentFormat,
    sourceArtifactRef: captured.value.sourceArtifactRef,
    sourceArtifactSha256: captured.value.sourceArtifactSha256,
    normalizedTextSha256,
    lineageArtifactRefs: captured.value.lineageArtifactRefs
  });
  const id = `source-document-${sha256(identity)}`;

  return ok({
    schemaVersion: SOURCE_DOCUMENT_SCHEMA_VERSION,
    id,
    runId: captured.value.runId,
    sourceItemId: captured.value.sourceItemId,
    sourceKind: captured.value.sourceKind,
    sourceArtifactRef: captured.value.sourceArtifactRef,
    sourceArtifactSha256: captured.value.sourceArtifactSha256,
    normalization: {
      version: SOURCE_NORMALIZATION_VERSION,
      inputFormat: captured.value.contentFormat,
      normalizedTextSha256,
      characterCount: normalizedText.length,
      utf8ByteCount: Buffer.byteLength(normalizedText, "utf8")
    },
    normalizedText,
    segments: createSegments(normalizedText, id),
    lineageArtifactRefs: captured.value.lineageArtifactRefs
  });
};

const sameLineage = (
  actual: unknown,
  expected: SourceArtifactLineage[]
): boolean => {
  const parsed = readLineage(actual);
  return (
    parsed !== undefined &&
    parsed.length === expected.length &&
    parsed.every(
      (entry, index) =>
        entry.artifactRef === expected[index]?.artifactRef &&
        entry.artifactSha256 === expected[index]?.artifactSha256
    )
  );
};

const sameSegments = (actual: unknown, expected: SourceSegment[]): boolean =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((entry, index) => {
    const expectedSegment = expected[index];
    return (
      isRecord(entry) &&
      expectedSegment !== undefined &&
      entry.id === expectedSegment.id &&
      entry.ordinal === expectedSegment.ordinal &&
      entry.kind === expectedSegment.kind &&
      entry.text === expectedSegment.text &&
      entry.textSha256 === expectedSegment.textSha256 &&
      entry.startUtf8Byte === expectedSegment.startUtf8Byte &&
      entry.endUtf8Byte === expectedSegment.endUtf8Byte
    );
  });

export const validateSourceDocument = (
  value: unknown
): Result<SourceDocument, SourceDocumentError> => {
  if (!isRecord(value) || !isRecord(value.normalization)) {
    return err("INVALID_SOURCE_DOCUMENT");
  }

  const expected = createSourceDocument({
    runId: value.runId,
    sourceItemId: value.sourceItemId,
    sourceKind: value.sourceKind,
    contentFormat: value.normalization.inputFormat,
    body: value.normalizedText,
    sourceArtifactRef: value.sourceArtifactRef,
    sourceArtifactSha256: value.sourceArtifactSha256,
    lineageArtifactRefs: value.lineageArtifactRefs
  });
  if (!expected.ok) {
    return err("INVALID_SOURCE_DOCUMENT");
  }

  const document = expected.value;
  if (
    value.schemaVersion !== document.schemaVersion ||
    value.id !== document.id ||
    value.normalization.version !== document.normalization.version ||
    value.normalization.normalizedTextSha256 !==
      document.normalization.normalizedTextSha256 ||
    value.normalization.characterCount !== document.normalization.characterCount ||
    value.normalization.utf8ByteCount !== document.normalization.utf8ByteCount ||
    !sameSegments(value.segments, document.segments) ||
    !sameLineage(value.lineageArtifactRefs, document.lineageArtifactRefs)
  ) {
    return err("SOURCE_DOCUMENT_MISMATCH");
  }
  return ok(document);
};

export const validateSourceAnchor = (
  documentValue: unknown,
  documentArtifactRef: string,
  documentArtifactSha256: string,
  anchorValue: unknown
): Result<SourceAnchor, SourceAnchorError> => {
  const document = validateSourceDocument(documentValue);
  if (!document.ok) {
    return document;
  }
  const artifactRef = nonEmptyString(documentArtifactRef);
  const artifactSha256 = validSha256(documentArtifactSha256);
  if (!artifactRef || !artifactSha256 || !isRecord(anchorValue)) {
    return err("INVALID_SOURCE_ANCHOR");
  }
  if (anchorValue.sourceDocumentId !== document.value.id) {
    return err("SOURCE_DOCUMENT_ID_MISMATCH");
  }
  if (
    anchorValue.sourceDocumentArtifactRef !== artifactRef ||
    anchorValue.sourceDocumentArtifactSha256 !== artifactSha256
  ) {
    return err("SOURCE_DOCUMENT_ARTIFACT_MISMATCH");
  }

  const segmentId = nonEmptyString(anchorValue.segmentId);
  const segment = document.value.segments.find((entry) => entry.id === segmentId);
  if (!segment) {
    return err("SOURCE_SEGMENT_NOT_FOUND");
  }
  if (anchorValue.segmentSha256 !== segment.textSha256) {
    return err("SOURCE_SEGMENT_SHA256_MISMATCH");
  }

  const quote = typeof anchorValue.quote === "string" ? anchorValue.quote : undefined;
  const start = anchorValue.quoteStartUtf8Byte;
  const end = anchorValue.quoteEndUtf8Byte;
  const segmentBytes = Buffer.from(segment.text, "utf8");
  if (
    !quote?.trim() ||
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > segmentBytes.length
  ) {
    return err("SOURCE_QUOTE_OUT_OF_RANGE");
  }
  if (segmentBytes.subarray(start, end).toString("utf8") !== quote) {
    return err("SOURCE_QUOTE_MISMATCH");
  }

  return ok({
    sourceDocumentId: document.value.id,
    sourceDocumentArtifactRef: artifactRef,
    sourceDocumentArtifactSha256: artifactSha256,
    segmentId: segment.id,
    segmentSha256: segment.textSha256,
    quote,
    quoteStartUtf8Byte: start,
    quoteEndUtf8Byte: end
  });
};
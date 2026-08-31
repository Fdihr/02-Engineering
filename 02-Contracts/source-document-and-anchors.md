# Canonical Source Document and Anchors

Status: Active baseline for retrieved publisher content
Validated: 2026-08-31
Implementation: `../app/src/modules/source/source-document.ts`, `../app/src/modules/source/retrieved-source-adapter.ts`, `../app/src/commands/canonicalize-source.ts`

## Purpose

Convert captured source content into one immutable, provider-neutral document before any semantic model stage runs. The same downstream relevance, extraction, adjudication, synthesis, and verification code must work for Seerist-native content, retrieved publisher content, and future supported source adapters.

Segmentation is independent of the research question. A new question may reuse the same canonical source document without parsing or copying the source again.

## Adapter boundary

Each source-specific adapter may only extract observed content and provenance into this common input:

```ts
type CapturedSourceContent = {
  runId: string;
  sourceItemId: string;
  sourceKind: "provider-captured" | "retrieved-publisher";
  contentFormat: "markdown" | "plain-text";
  body: string;
  sourceArtifactRef: string;
  sourceArtifactSha256: string;
  lineageArtifactRefs: Array<{
    artifactRef: string;
    artifactSha256: string;
  }>;
};
```

The implemented retrieval adapter reads only a canonical resolved `SourceRetrievalResult`, never the raw Firecrawl schema. A Seerist captured-content adapter remains a later narrow addition. Adapters do not assess relevance, quality, credibility, or truth.

## Command

Run from `app/`:

```powershell
npm run canonicalize:source -- <source-retrieval-result.json>
```

The command confines input to the configured run directory, computes the retrieval-result checksum, invokes the retrieval adapter and shared pure canonicalizer, and writes one non-overwritable document to:

```text
runs/<runId>/sources/<retrievalId>/source-document.json
```

Controller-attributed completion and failure events append to `runs/source-document-events.jsonl`. Console and event output omit source content.

## Canonical document

```ts
type SourceDocument = {
  schemaVersion: "source-document-v1";
  id: string;
  runId: string;
  sourceItemId: string;
  sourceKind: CapturedSourceContent["sourceKind"];
  sourceArtifactRef: string;
  sourceArtifactSha256: string;
  normalization: {
    version: "source-normalization-v1";
    inputFormat: CapturedSourceContent["contentFormat"];
    normalizedTextSha256: string;
    characterCount: number;
    utf8ByteCount: number;
  };
  normalizedText: string;
  segments: SourceSegment[];
  lineageArtifactRefs: CapturedSourceContent["lineageArtifactRefs"];
};

type SourceSegment = {
  id: string;
  ordinal: number;
  kind: "heading" | "paragraph" | "list-item" | "quote" | "table-row" | "other";
  text: string;
  textSha256: string;
  startUtf8Byte: number;
  endUtf8Byte: number;
};
```

Normalization version 1 converts CRLF and CR line endings to LF. It does not perform Unicode normalization, translation, correction, summarization, deduplication, reordering, or instruction interpretation. The original artifact remains the evidence input; the source document is a derived analysis surface.

The segmentation algorithm and maximum segment size are versioned implementation policy. Segments preserve source order and exact normalized text. Their half-open UTF-8 byte ranges must be non-overlapping and must resolve exactly to `text`. Empty segments are prohibited.

The document ID is a deterministic hash over the schema and normalization versions, run and source identity, source kind and format, source-artifact reference and checksum, normalized-text checksum, and ordered lineage. Segment IDs bind the document ID, ordinal, normalization version, and segment checksum. Reprocessing identical input under the same versions must produce identical IDs and boundaries. Identical source bytes under different provenance receive different document IDs; deduplication compares source-artifact or normalized-text checksums without collapsing provenance.

## Stable source anchor

Every model-produced assertion about source content uses this common anchor:

```ts
type SourceAnchor = {
  sourceDocumentId: string;
  sourceDocumentArtifactRef: string;
  sourceDocumentArtifactSha256: string;
  segmentId: string;
  segmentSha256: string;
  quote: string;
  quoteStartUtf8Byte: number;
  quoteEndUtf8Byte: number;
};
```

Anchor offsets are half-open and relative to the referenced segment. Version 1 anchors cannot cross segment boundaries. Deterministic validation requires:

1. The source-document artifact checksum matches.
2. The segment exists in that exact document and its checksum matches.
3. The quote offsets are within the segment.
4. The UTF-8 byte slice equals `quote` exactly.
5. The quote is non-empty.

These checks prove identity and exact source presence. They do not prove that the quote supports an interpretation, answers a research question, or is factually true. Those are semantic assessments and remain explicitly model-proposed and human-reviewable.

## Intelligence-quality invariants

Canonicalization is lossless for analysis. It may normalize line endings and divide text into addressable segments, but it must not paraphrase, translate, summarize, omit, reorder, or deduplicate source content. The complete normalized text remains available to every source-assurance stage alongside the original source artifact.

Adopting this contract must not remove or relax:

1. Human evidence admission before claim-bearing source assurance.
2. Independent `Find` and blind `Sweep` extraction for every admitted source under the current quality policy.
3. `Judge` reconciliation against the complete source and both extraction passes.
4. Preservation of source reporting, analytic judgments, alternatives, contradictions, caveats, gaps, and calibrated confidence.
5. Cross-source dependency challenge and adjudication.
6. Dual-lineage Vestas relevance assessment.
7. Independent memo verification and human publication approval.

The contract changes addressing and reuse, not the evidence standard or final memo contract. If the canonical representation cannot reproduce the complete normalized source exactly, it must fail closed and cannot enter AI assessment.

## Security and authority

Source text is untrusted data. Segment text cannot change model instructions, output schemas, tools, budgets, or workflow state. Model stages receive the approved task separately from the source document and have no provider, filesystem, or transition tools.

Deterministic code owns extraction from canonical artifacts, normalization, segmentation, hashing, anchor validation, persistence, and events. Models may reference segments and propose semantic relationships; they cannot create or mutate source segments.

## Reuse boundary

Downstream modules depend only on `SourceDocument`, `SourceAnchor`, approved-question lineage, and their own typed input. They must not import Firecrawl response types, Seerist payload shapes, or source-specific parsers.

A new source mechanism requires only:

1. A narrow adapter into `CapturedSourceContent`.
2. Tests proving artifact and content lineage.
3. No change to relevance, assurance, synthesis, or memo contracts when the common input remains satisfied.

Scaling across similar cases comes from reusing this contract, processing independent documents sequentially or under a bounded concurrency policy, and deduplicating identical source-artifact checksums. It does not come from skipping assurance stages or lowering completion criteria.

## Proven boundary

Focused tests prove deterministic reproduction, multilingual UTF-8 offsets, CRLF normalization, long-block segmentation, exact quote resolution, altered-document and altered-segment rejection, path confinement, provider-neutral document parity, non-overwrite behavior, and prompt-like text remaining inert.

The selected live NV retrieval was canonicalized locally without another provider call. Its persisted document validates against the pure reconstruction function, contains 76 segments over 8,875 normalized characters and 12,545 UTF-8 bytes, and records the exact SHA-256 of its retrieval-result artifact. This establishes representation and lineage only; no relevance, factuality, credibility, or evidence-approval judgment was made.
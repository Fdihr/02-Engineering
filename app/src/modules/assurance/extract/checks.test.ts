import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument } from "../../source/source-document.js";
import { validateProfilePolicy } from "../policy.js";
import type {
  ExtractOutput,
  ProfilePolicy,
  RequirementDefinition
} from "../types.js";
import { runExtractChecks, validateExtractProposal } from "./checks.js";

const policyResult = validateProfilePolicy({
  policyId: "geopolitical-source-assurance-v1",
  claimKinds: ["event", "statement", "assessment", "forecast"],
  attributionKinds: ["direct", "attributed", "relayed"],
  dateRoles: ["event", "reporting", "publication", "reference", "unknown"],
  dispositions: ["covered", "partial", "silent", "contradicted"],
  reviewVerdicts: ["supported", "unsupported", "duplicate", "chrome"],
  limits: {
    quoteMinUtf8Bytes: 20,
    quoteMaxUtf8Bytes: 600,
    textMaxChars: 240,
    maxObservations: 60,
    maxAttempts: 2
  }
});
if (!policyResult.ok) {
  throw new Error(policyResult.error);
}
const policy: ProfilePolicy = policyResult.value;

const documentResult = createSourceDocument({
  runId: "run-1",
  sourceItemId: "source-1",
  sourceKind: "retrieved-publisher",
  contentFormat: "markdown",
  body: [
    "The ministry announced a formal review on 4 March.",
    "",
    "A spokesperson said the review would continue through spring."
  ].join("\n"),
  sourceArtifactRef: "runs/run-1/retrieval.json",
  sourceArtifactSha256: "c".repeat(64),
  lineageArtifactRefs: []
});
if (!documentResult.ok) {
  throw new Error(documentResult.error);
}
const document = documentResult.value;
const documentArtifactRef = "runs/run-1/sources/source-1/source-document.json";
const documentArtifactSha256 = "d".repeat(64);

const segmentId = (ordinal: number): string => {
  const segment = document.segments[ordinal];
  if (!segment) {
    throw new Error(`Missing fixture segment ${ordinal}`);
  }
  return segment.id;
};

const requirements: RequirementDefinition[] = [
  { irId: "ir-01", text: "Was a review announced?" },
  { irId: "ir-02", text: "What cyber implications were reported?" }
];

const context = {
  document,
  documentArtifactRef,
  documentArtifactSha256,
  requirements,
  policy
};

const validProposal = {
  observations: [
    {
      segmentId: segmentId(0),
      quote: "The ministry announced a formal review on 4 March.",
      text: "The ministry announced a formal review.",
      claimKind: "event",
      attribution: { kind: "direct" },
      date: { text: "4 March", role: "event" },
      irIds: ["ir-01"]
    }
  ],
  dispositions: [
    { irId: "ir-01", disposition: "covered", observationIndexes: [0] },
    { irId: "ir-02", disposition: "silent", observationIndexes: [] }
  ]
};

const parse = (value: unknown): ExtractOutput => {
  const parsed = validateExtractProposal(value, policy);
  if (!parsed.ok) {
    throw new Error(`Expected a parsable proposal: ${parsed.error.check}`);
  }
  return parsed.value;
};

const failureChecks = (value: unknown): string[] => {
  const parsed = validateExtractProposal(value, policy);
  if (!parsed.ok) {
    return [parsed.error.check];
  }
  const outcome = runExtractChecks(parsed.value, context);
  return outcome.status === "failed"
    ? outcome.failures.map((entry) => entry.check)
    : [];
};

test("commits a valid proposal with anchored observations and dispositions", () => {
  const outcome = runExtractChecks(parse(validProposal), context);
  assert.equal(outcome.status, "passed");
  if (outcome.status === "passed") {
    assert.equal(outcome.observations.length, 1);
    assert.equal(outcome.observations[0]?.origin, "model");
    assert.equal(outcome.dispositions.length, 2);
    assert.deepEqual(outcome.dispositions[1]?.observationIds, []);
  }
});

test("accepts zero observations when every requirement is silent", () => {
  const outcome = runExtractChecks(
    parse({
      observations: [],
      dispositions: [
        { irId: "ir-01", disposition: "silent", observationIndexes: [] },
        { irId: "ir-02", disposition: "silent", observationIndexes: [] }
      ]
    }),
    context
  );
  assert.equal(outcome.status, "passed");
});

test("E1 rejects malformed output and unknown enumerations", () => {
  assert.deepEqual(failureChecks({ observations: [] }), ["E1"]);
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [{ ...validProposal.observations[0], claimKind: "rumour" }]
    }),
    ["E1"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [{ ...validProposal.observations[0], text: "x".repeat(241) }]
    }),
    ["E1"]
  );
});

test("E2 rejects an unknown segment id", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        { ...validProposal.observations[0], segmentId: "source-segment-missing" }
      ]
    }),
    ["E2"]
  );
});

test("E3 rejects quotes that are not byte-exact or unique", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        {
          ...validProposal.observations[0],
          quote: "The ministry announced a formal  review on 4 March."
        }
      ]
    }),
    ["E3"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        { ...validProposal.observations[0], quote: "a formal review" }
      ]
    }),
    ["E3"]
  );
});

test("E4 rejects unapproved or repeated requirement ids", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [{ ...validProposal.observations[0], irIds: ["ir-99"] }],
      dispositions: [
        { irId: "ir-01", disposition: "silent", observationIndexes: [] },
        { irId: "ir-02", disposition: "silent", observationIndexes: [] }
      ]
    }),
    ["E4"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        { ...validProposal.observations[0], irIds: ["ir-01", "ir-01"] }
      ]
    }),
    ["E4"]
  );
});

test("E5 rejects missing, unknown, or duplicated requirement dispositions", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      dispositions: [
        { irId: "ir-01", disposition: "covered", observationIndexes: [0] }
      ]
    }),
    ["E5"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      dispositions: [
        { irId: "ir-01", disposition: "covered", observationIndexes: [0] },
        { irId: "ir-02", disposition: "silent", observationIndexes: [] },
        { irId: "ir-03", disposition: "silent", observationIndexes: [] }
      ]
    }),
    ["E5"]
  );
});

test("E6 requires each disposition index set to equal its tagged observations", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      dispositions: [
        { irId: "ir-01", disposition: "covered", observationIndexes: [] },
        { irId: "ir-02", disposition: "silent", observationIndexes: [] }
      ]
    }),
    ["E6"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      dispositions: [
        { irId: "ir-01", disposition: "covered", observationIndexes: [0] },
        { irId: "ir-02", disposition: "partial", observationIndexes: [0] }
      ]
    }),
    ["E6"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      dispositions: [
        { irId: "ir-01", disposition: "covered", observationIndexes: [0, 5] },
        { irId: "ir-02", disposition: "silent", observationIndexes: [] }
      ]
    }),
    ["E6"]
  );
});

test("E7 requires attribution for statements and relayed reporting", () => {
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        {
          ...validProposal.observations[0],
          claimKind: "statement",
          attribution: { kind: "direct" }
        }
      ]
    }),
    ["E7"]
  );
  assert.deepEqual(
    failureChecks({
      ...validProposal,
      observations: [
        {
          ...validProposal.observations[0],
          attribution: { kind: "relayed" }
        }
      ]
    }),
    ["E7"]
  );
});

test("E8 rejects more observations than the policy allows", () => {
  const capped = { ...policy, limits: { ...policy.limits, maxObservations: 0 } };
  const outcome = runExtractChecks(parse(validProposal), {
    ...context,
    policy: capped
  });
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.deepEqual(
      outcome.failures.map((entry) => entry.check),
      ["E8"]
    );
  }
});

test("E9 reports anchors the source module refuses", () => {
  const outcome = runExtractChecks(parse(validProposal), {
    ...context,
    documentArtifactSha256: "not-a-checksum"
  });
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    assert.deepEqual(
      outcome.failures.map((entry) => entry.check),
      ["E9"]
    );
  }
});

test("failures carry counts and rules but never source content", () => {
  const parsed = parse({
    ...validProposal,
    observations: [
      {
        ...validProposal.observations[0],
        quote: "The ministry announced a formal  review on 4 March."
      }
    ]
  });
  const outcome = runExtractChecks(parsed, context);
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") {
    const serialized = JSON.stringify(outcome.failures);
    assert.match(serialized, /"count":1/);
    assert.doesNotMatch(serialized, /ministry/);
  }
});

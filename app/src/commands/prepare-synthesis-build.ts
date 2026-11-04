import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSynthesisBuildEnvelope } from "../modules/synthesis/build.js";
import {
  validateOutletIdentityTable,
  validateSynthesisProfilePolicy
} from "../modules/synthesis/policy.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import { createSynthesisBuildRequest } from "../modules/synthesis/request.js";
import { isRecord } from "../modules/assurance/validators.js";
import { BUILD_REQUEST_SCHEMA_VERSION, type BoundSourceNote, type OutletIdentityTable, type SynthesisProfilePolicy } from "../modules/synthesis/types.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import { writeSynthesisArtifact } from "./synthesis-io.js";
import {
  artifactRef,
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadJsonArtifact,
  loadRunArtifact,
  longPath,
  withSyncRetry
} from "./assurance-io.js";

const usage =
  "Usage: npm run prepare:synthesis-build -- <synthesis-policy.json> <outlet-identity-table.json> <source-note.json> [source-note.json ...] [--prior=<synthesis-id>] [--authorisation=<artifact.json>]";

export const prepareSynthesisBuild = async (runRoot: string, input: {
  sources: BoundSourceNote[]; policy: SynthesisProfilePolicy; policyArtifact: ArtifactBinding;
  outletIdentityTable: OutletIdentityTable; outletIdentityArtifact: ArtifactBinding;
  createdAt: string; priorSynthesisId?: string; authorisation?: ArtifactBinding;
}, reuse = false) => {
  const envelope = createSynthesisBuildEnvelope(input);
  if (!envelope.ok) throw new Error(`Build envelope rejected: ${envelope.error}`);
  const directory = resolve(runRoot, envelope.value.runId, "synthesis");
  await ensureDirectory(directory);
  const envelopeOutput = await writeSynthesisArtifact(resolve(directory, `${envelope.value.id}.json`), envelope.value, reuse);
  const envelopeArtifact = await loadJsonArtifact(resolve(envelopeOutput));
  const request = createSynthesisBuildRequest({
    envelope: envelope.value, envelopeArtifact: envelopeArtifact.binding,
    sources: input.sources, policy: input.policy, preparedAt: input.createdAt,
    ...(input.authorisation ? { authorisation: input.authorisation } : {})
  });
  if (!request.ok) throw new Error(`Build request rejected: ${request.error}`);
  const requestDir = resolve(directory, "requests", request.value.id);
  await ensureDirectory(requestDir);
  const output = await writeSynthesisArtifact(resolve(requestDir, "build-request.json"), request.value, reuse);
  return { envelope: envelope.value, envelopeOutput, request: request.value, output };
};

const main = async (): Promise<void> => {
  const createdAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  try {
    const args = process.argv.slice(2);
    const priorArgs = args.filter((entry) => entry.startsWith("--prior="));
    const authorisationArgs = args.filter((entry) => entry.startsWith("--authorisation="));
    const paths = args.filter(
      (entry) =>
        !entry.startsWith("--prior=") && !entry.startsWith("--authorisation=")
    );
    if (
      paths.length < 3 ||
      priorArgs.length > 1 ||
      authorisationArgs.length > 1 ||
      paths.length + priorArgs.length + authorisationArgs.length !== args.length
    ) {
      throw new Error(usage);
    }
    const [policyPath, outletPath, ...notePaths] = paths;
    if (!policyPath || !outletPath || notePaths.length === 0) {
      throw new Error(usage);
    }
    const priorSynthesisId = priorArgs[0]?.slice("--prior=".length).trim() || undefined;
    const authorisationPath =
      authorisationArgs[0]?.slice("--authorisation=".length).trim() || undefined;

    const policyArtifact = await loadJsonArtifact(resolve(policyPath));
    const policy = validateSynthesisProfilePolicy(policyArtifact.value);
    if (!policy.ok) throw new Error(`Synthesis policy rejected: ${policy.error}`);
    const outletArtifact = await loadJsonArtifact(resolve(outletPath));
    const outlets = validateOutletIdentityTable(outletArtifact.value);
    if (!outlets.ok) throw new Error(`Outlet identity table rejected: ${outlets.error}`);

    const sources = [];
    for (const notePath of notePaths) {
      const loaded = await loadRunArtifact(runRoot, notePath, "Source note");
      const note = validateSynthesisSourceNote(loaded.value);
      if (!note.ok) throw new Error(`Source note rejected: ${note.error}`);
      sources.push({ note: note.value, artifact: loaded.binding });
    }

    const authorisationArtifact = authorisationPath
      ? await loadRunArtifact(runRoot, authorisationPath, "Build authorisation")
      : undefined;
    if (
      authorisationArtifact &&
      (!isRecord(authorisationArtifact.value) ||
        authorisationArtifact.value.schemaVersion !==
          "synthesis-build-attempt-authorisation-v1" ||
        authorisationArtifact.value.decision !== "fresh-request-authorised" ||
        authorisationArtifact.value.requiredRequestSchemaVersion !==
          BUILD_REQUEST_SCHEMA_VERSION)
    ) {
      throw new Error("Build authorisation is invalid.");
    }

    const prepared = await prepareSynthesisBuild(runRoot, {
      sources,
      policy: policy.value,
      policyArtifact: policyArtifact.binding,
      outletIdentityTable: outlets.value,
      outletIdentityArtifact: outletArtifact.binding,
      createdAt,
      ...(priorSynthesisId ? { priorSynthesisId } : {}),
      ...(authorisationArtifact ? { authorisation: authorisationArtifact.binding } : {})
    });
    const { envelope, envelopeOutput, output: requestOutput } = prepared;
    const synthesisDir = resolve(runRoot, envelope.runId, "synthesis");
    const event = {
      runId: envelope.runId,
      occurredAt: createdAt,
      actorType: "controller",
      stage: "external_synthesis",
      step: "build_envelope",
      eventType: "synthesis.build.envelope.prepared",
      status: "completed",
      artifactRef: requestOutput,
      envelopeArtifactRef: envelopeOutput,
      reviewStatus: envelope.reviewStatus,
      limitedEvidence: envelope.limitedEvidence
    };
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(synthesisDir, "events.jsonl")),
        `${JSON.stringify(event)}\n`,
        "utf8"
      )
    );

    console.log(`Run: ${envelope.runId}`);
    console.log(`Build envelope: ${envelope.id}`);
    console.log(`Review status: ${envelope.reviewStatus}`);
    console.log(`Limited evidence: ${envelope.limitedEvidence}`);
    console.log(`Source notes: ${envelope.sourceNoteIds.length}`);
    console.log(`Envelope: ${artifactRef(resolve(envelopeOutput))}`);
    console.log(`Output: ${artifactRef(resolve(requestOutput))}`);
  } catch (error) {
    console.error(`Synthesis Build preparation failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
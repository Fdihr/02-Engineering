import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createSynthesisBuildEnvelope,
  validateSynthesisBuildEnvelope
} from "../modules/synthesis/build.js";
import {
  validateOutletIdentityTable,
  validateSynthesisProfilePolicy
} from "../modules/synthesis/policy.js";
import {
  createSynthesisBuildRequest,
  validateSynthesisBuildRequest
} from "../modules/synthesis/request.js";
import { recordSynthesisBuildResponse } from "../modules/synthesis/response.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import { canonicalJson } from "../modules/assurance/validators.js";
import { isRecord } from "../modules/assurance/validators.js";
import {
  assuranceRunRoot,
  commandError,
  ensureDirectory,
  loadJsonArtifact,
  loadRunArtifact,
  longPath,
  requireChecksum,
  withSyncRetry,
  writeJsonOnce
} from "./assurance-io.js";

const usage =
  "Usage: npm run record:synthesis-build -- <build-request.json> <copilot-response.json>";

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let runId: string | undefined;
  let responseArtifactRef: string | undefined;
  try {
    const [requestPath, responsePath, ...extra] = process.argv.slice(2);
    if (!requestPath || !responsePath || extra.length > 0) throw new Error(usage);

    const requestArtifact = await loadRunArtifact(runRoot, requestPath, "Build request");
    const request = validateSynthesisBuildRequest(requestArtifact.value);
    if (!request.ok) throw new Error(`Build request rejected: ${request.error}`);
    runId = request.value.runId;
    let authorisationArtifact;
    if (request.value.authorisation) {
      authorisationArtifact = requireChecksum(
        await loadRunArtifact(
          runRoot,
          request.value.authorisation.artifactRef,
          "Build authorisation"
        ),
        request.value.authorisation.artifactSha256,
        "Build authorisation"
      );
      if (
        !isRecord(authorisationArtifact.value) ||
        authorisationArtifact.value.schemaVersion !==
          "synthesis-build-attempt-authorisation-v1" ||
        authorisationArtifact.value.runId !== runId ||
        authorisationArtifact.value.decision !== "fresh-request-authorised" ||
        authorisationArtifact.value.requiredRequestSchemaVersion !==
          request.value.schemaVersion
      ) {
        throw new Error("Build authorisation is invalid or mismatched.");
      }
    }
    const envelopeArtifact = requireChecksum(
      await loadRunArtifact(runRoot, request.value.envelope.artifactRef, "Build envelope"),
      request.value.envelope.artifactSha256,
      "Build envelope"
    );
    const envelope = validateSynthesisBuildEnvelope(envelopeArtifact.value);
    if (!envelope.ok) throw new Error(`Build envelope rejected: ${envelope.error}`);

    const policyArtifact = requireChecksum(
      await loadJsonArtifact(resolve(envelope.value.policy.artifactRef)),
      envelope.value.policy.artifactSha256,
      "Synthesis policy"
    );
    const policy = validateSynthesisProfilePolicy(policyArtifact.value);
    if (!policy.ok) throw new Error(`Synthesis policy rejected: ${policy.error}`);
    const outletArtifact = requireChecksum(
      await loadJsonArtifact(resolve(envelope.value.outletIdentityTable.artifactRef)),
      envelope.value.outletIdentityTable.artifactSha256,
      "Outlet identity table"
    );
    const outlets = validateOutletIdentityTable(outletArtifact.value);
    if (!outlets.ok) throw new Error(`Outlet identity table rejected: ${outlets.error}`);

    const sources = [];
    for (const sourceBinding of envelope.value.sourceNotes) {
      const sourceArtifact = requireChecksum(
        await loadRunArtifact(runRoot, sourceBinding.artifactRef, "Source note"),
        sourceBinding.artifactSha256,
        "Source note"
      );
      const note = validateSynthesisSourceNote(sourceArtifact.value);
      if (!note.ok) throw new Error(`Source note rejected: ${note.error}`);
      sources.push({ note: note.value, artifact: sourceArtifact.binding });
    }

    const recomputedEnvelope = createSynthesisBuildEnvelope({
      sources,
      policy: policy.value,
      policyArtifact: policyArtifact.binding,
      outletIdentityTable: outlets.value,
      outletIdentityArtifact: outletArtifact.binding,
      createdAt: envelope.value.createdAt,
      ...(envelope.value.priorSynthesisId
        ? { priorSynthesisId: envelope.value.priorSynthesisId }
        : {})
    });
    if (
      !recomputedEnvelope.ok ||
      canonicalJson(recomputedEnvelope.value) !== canonicalJson(envelope.value)
    ) {
      throw new Error("Build envelope no longer matches its deterministic inputs.");
    }
    const recomputedRequest = createSynthesisBuildRequest({
      envelope: envelope.value,
      envelopeArtifact: envelopeArtifact.binding,
      sources,
      policy: policy.value,
      preparedAt: request.value.preparedAt,
      schemaVersion: request.value.schemaVersion,
      ...(authorisationArtifact
        ? { authorisation: authorisationArtifact.binding }
        : {})
    });
    if (
      !recomputedRequest.ok ||
      canonicalJson(recomputedRequest.value) !== canonicalJson(request.value)
    ) {
      throw new Error("Build request no longer matches its deterministic inputs.");
    }

    const responseArtifact = await loadRunArtifact(runRoot, responsePath, "Build response");
    responseArtifactRef = responseArtifact.binding.artifactRef;
    const record = recordSynthesisBuildResponse({
      request: request.value,
      requestArtifact: requestArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      envelope: envelope.value,
      envelopeArtifact: envelopeArtifact.binding,
      sources,
      policy: policy.value,
      outletIdentityTable: outlets.value,
      recordedAt
    });
    if (!record.ok) throw new Error(`Build response rejected: ${record.error}`);

    const recordDir = resolve(
      runRoot,
      record.value.runId,
      "synthesis",
      "records",
      record.value.id
    );
    await ensureDirectory(recordDir);
    const output = await writeJsonOnce(
      resolve(recordDir, "synthesis-build-record.json"),
      record.value
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(resolve(runRoot, record.value.runId, "synthesis", "events.jsonl")),
        `${JSON.stringify({
          runId: record.value.runId,
          occurredAt: recordedAt,
          actorType: "controller",
          stage: "external_synthesis",
          step: "build_record",
          eventType: "synthesis.build.recorded",
          status: "completed",
          artifactRef: output,
          reviewStatus: record.value.reviewStatus,
          limitedEvidence: record.value.limitedEvidence
        })}\n`,
        "utf8"
      )
    );

    console.log(`Run: ${record.value.runId}`);
    console.log(`Build record: ${record.value.id}`);
    console.log(`Review status: ${record.value.reviewStatus}`);
    console.log(`Limited evidence: ${record.value.limitedEvidence}`);
    console.log(`Claims: ${record.value.synthesis.claims.length}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    const message = commandError(error);
    if (runId) {
      const failedRunId = runId;
      try {
        await withSyncRetry(() =>
          appendFile(
            longPath(resolve(runRoot, failedRunId, "synthesis", "events.jsonl")),
            `${JSON.stringify({
              runId: failedRunId,
              occurredAt: recordedAt,
              actorType: "controller",
              stage: "external_synthesis",
              step: "build_record",
              eventType: "synthesis.build.rejected",
              status: "failed",
              responseArtifactRef,
              error: message
            })}\n`,
            "utf8"
          )
        );
      } catch (eventError) {
        console.error(`Build failure event logging failed: ${commandError(eventError)}`);
      }
    }
    console.error(`Synthesis Build recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
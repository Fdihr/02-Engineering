import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assembleSourceNote } from "../modules/assurance/assemble.js";
import { approveRequirements } from "../modules/assurance/requirements.js";
import { validateReviewPackage } from "../modules/assurance/review/package.js";
import { recordReview, validateReviewRecord } from "../modules/assurance/review/record.js";
import { isRecord } from "../modules/assurance/validators.js";
import { createSynthesisBuildEnvelope, validateSynthesisBuildEnvelope } from "../modules/synthesis/build.js";
import { createChallengeRequest, recordChallengeResponse, validateChallengeRecord, validateChallengeRequest } from "../modules/synthesis/challenge.js";
import { validateOutletIdentityTable, validateSynthesisProfilePolicy } from "../modules/synthesis/policy.js";
import { createSynthesisBuildRequest, validateSynthesisBuildRequest } from "../modules/synthesis/request.js";
import { recordSynthesisBuildResponse, validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
import { validateSynthesisSourceNote } from "../modules/synthesis/source-note.js";
import type { ArtifactBinding } from "../modules/assurance/types.js";
import type { SynthesisBuildEnvelope } from "../modules/synthesis/types.js";
import { artifactRef, loadAdmittedSource, loadCommitContext, loadJsonArtifact, loadRunArtifact, requireChecksum, writeJsonOnce } from "./assurance-io.js";
import { loadRssQuestion } from "./rss-io.js";

export const reopenSynthesisBinding = async (root: string, binding: ArtifactBinding, label: string) =>
  requireChecksum(await loadRunArtifact(root, binding.artifactRef, label), binding.artifactSha256, label);

export const writeSynthesisArtifact = async (path: string, value: unknown, reuse: boolean) => {
  try {
    return await writeJsonOnce(path, value);
  } catch (error) {
    if (!reuse || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await loadJsonArtifact(path);
    if (!isDeepStrictEqual(existing.value, value)) throw new Error("Existing synthesis artifact does not match the frozen preparation.");
    return artifactRef(path);
  }
};

export const loadSynthesisSources = async (root: string, envelope: SynthesisBuildEnvelope) => {
  const sources = [];
  for (const binding of envelope.sourceNotes) {
    const artifact = await reopenSynthesisBinding(root, binding, "Source note");
    const note = validateSynthesisSourceNote(artifact.value);
    if (!note.ok) throw new Error(`Source note rejected: ${note.error}`);
    sources.push({ note: note.value, artifact: artifact.binding });
  }
  return sources;
};

export const loadBuildRequestContext = async (root: string, path: string) => {
  const requestArtifact = await loadRunArtifact(root, path, "Build request");
  const request = validateSynthesisBuildRequest(requestArtifact.value);
  if (!request.ok) throw new Error(`Build request rejected: ${request.error}`);
  const authorisation = request.value.authorisation
    ? await reopenSynthesisBinding(root, request.value.authorisation, "Build authorisation") : undefined;
  if (authorisation && (!isRecord(authorisation.value) ||
      authorisation.value.schemaVersion !== "synthesis-build-attempt-authorisation-v1" ||
      authorisation.value.runId !== request.value.runId ||
      authorisation.value.decision !== "fresh-request-authorised" ||
      authorisation.value.requiredRequestSchemaVersion !== request.value.schemaVersion)) {
    throw new Error("Build authorisation is invalid or mismatched.");
  }
  const envelopeArtifact = await reopenSynthesisBinding(root, request.value.envelope, "Build envelope");
  const envelope = validateSynthesisBuildEnvelope(envelopeArtifact.value);
  if (!envelope.ok) throw new Error(`Build envelope rejected: ${envelope.error}`);
  const policyArtifact = requireChecksum(await loadJsonArtifact(resolve(envelope.value.policy.artifactRef)),
    envelope.value.policy.artifactSha256, "Synthesis policy");
  const policy = validateSynthesisProfilePolicy(policyArtifact.value);
  if (!policy.ok) throw new Error(`Synthesis policy rejected: ${policy.error}`);
  const outletArtifact = requireChecksum(await loadJsonArtifact(resolve(envelope.value.outletIdentityTable.artifactRef)),
    envelope.value.outletIdentityTable.artifactSha256, "Outlet identity table");
  const outlets = validateOutletIdentityTable(outletArtifact.value);
  if (!outlets.ok) throw new Error(`Outlet identity table rejected: ${outlets.error}`);
  const sources = await loadSynthesisSources(root, envelope.value);
  const expectedEnvelope = createSynthesisBuildEnvelope({
    sources, policy: policy.value, policyArtifact: policyArtifact.binding,
    outletIdentityTable: outlets.value, outletIdentityArtifact: outletArtifact.binding,
    createdAt: envelope.value.createdAt,
    ...(envelope.value.priorSynthesisId ? { priorSynthesisId: envelope.value.priorSynthesisId } : {})
  });
  if (!expectedEnvelope.ok || !isDeepStrictEqual(expectedEnvelope.value, envelope.value)) {
    throw new Error("Build envelope no longer matches its deterministic inputs.");
  }
  const expectedRequest = createSynthesisBuildRequest({
    envelope: envelope.value, envelopeArtifact: envelopeArtifact.binding, sources,
    policy: policy.value, preparedAt: request.value.preparedAt, schemaVersion: request.value.schemaVersion,
    ...(authorisation ? { authorisation: authorisation.binding } : {})
  });
  if (!expectedRequest.ok || !isDeepStrictEqual(expectedRequest.value, request.value)) {
    throw new Error("Build request no longer matches its deterministic inputs.");
  }
  return { request: request.value, requestArtifact, envelope: envelope.value, envelopeArtifact,
    policy: policy.value, policyArtifact, outlets: outlets.value, outletArtifact, sources };
};

export const loadBuildRecordContext = async (root: string, path: string) => {
  const recordArtifact = await loadRunArtifact(root, path, "Build record");
  const record = validateSynthesisBuildRecord(recordArtifact.value);
  if (!record.ok) throw new Error(`Build record rejected: ${record.error}`);
  const context = await loadBuildRequestContext(root, record.value.request.artifactRef);
  requireChecksum(context.requestArtifact, record.value.request.artifactSha256, "Build request");
  const response = await reopenSynthesisBinding(root, record.value.response, "Build response");
  const expected = recordSynthesisBuildResponse({
    request: context.request, requestArtifact: context.requestArtifact.binding,
    responseValue: response.value, responseArtifact: response.binding,
    envelope: context.envelope, envelopeArtifact: context.envelopeArtifact.binding,
    sources: context.sources, policy: context.policy, outletIdentityTable: context.outlets,
    recordedAt: record.value.recordedAt
  });
  if (!expected.ok || !isDeepStrictEqual(expected.value, record.value)) {
    throw new Error("Build record does not reconstruct from its validated response.");
  }
  return { ...context, record: record.value, recordArtifact };
};

export const loadChallengeRequestContext = async (root: string, path: string) => {
  const requestArtifact = await loadRunArtifact(root, path, "Challenge request");
  const request = validateChallengeRequest(requestArtifact.value);
  if (!request.ok) throw new Error(`Challenge request rejected: ${request.error}`);
  const build = await loadBuildRecordContext(root, request.value.buildRecord.artifactRef);
  requireChecksum(build.recordArtifact, request.value.buildRecord.artifactSha256, "Build record");
  const expected = createChallengeRequest({
    buildRecord: build.record, buildRecordArtifact: build.recordArtifact.binding,
    envelope: build.envelope, sources: build.sources, preparedAt: request.value.preparedAt
  });
  if (!expected.ok || !isDeepStrictEqual(expected.value, request.value)) {
    throw new Error("Challenge request no longer matches its deterministic inputs.");
  }
  return { build, request: request.value, requestArtifact };
};

export const loadChallengeRecordContext = async (root: string, path: string) => {
  const artifact = await loadRunArtifact(root, path, "Challenge record");
  const record = validateChallengeRecord(artifact.value);
  if (!record.ok) throw new Error(`Challenge record rejected: ${record.error}`);
  const context = await loadChallengeRequestContext(root, record.value.request.artifactRef);
  requireChecksum(context.requestArtifact, record.value.request.artifactSha256, "Challenge request");
  const response = await reopenSynthesisBinding(root, record.value.response, "Challenge response");
  const authorisation = record.value.revalidationAuthorisation
    ? await reopenSynthesisBinding(root, record.value.revalidationAuthorisation, "Challenge revalidation authorisation")
    : undefined;
  if (authorisation && (!isRecord(authorisation.value) ||
      authorisation.value.schemaVersion !== "synthesis-challenge-revalidation-authorisation-v1" ||
      authorisation.value.decision !== "stored-response-revalidation-authorised" ||
      !isRecord(authorisation.value.request) || !isRecord(authorisation.value.response) ||
      authorisation.value.request.artifactSha256 !== context.requestArtifact.binding.artifactSha256 ||
      authorisation.value.response.artifactSha256 !== response.binding.artifactSha256)) {
    throw new Error("Challenge revalidation authorisation is invalid or mismatched.");
  }
  const expected = recordChallengeResponse({
    request: context.request, requestArtifact: context.requestArtifact.binding,
    responseValue: response.value, responseArtifact: response.binding,
    buildRecord: context.build.record, buildRecordArtifact: context.build.recordArtifact.binding,
    ...(authorisation ? { revalidationAuthorisation: authorisation.binding } : {}),
    recordedAt: record.value.recordedAt
  });
  if (!expected.ok || !isDeepStrictEqual(expected.value, record.value)) {
    throw new Error("Challenge record does not reconstruct from its validated response.");
  }
  return { ...context, record: record.value, recordArtifact: artifact };
};

export const validateSavedSynthesisResponse = async (
  root: string, stage: "build" | "challenge", requestPath: string, responsePath: string, recordedAt: string
) => {
  const response = await loadRunArtifact(root, responsePath, `${stage} response`);
  if (stage === "build") {
    const context = await loadBuildRequestContext(root, requestPath);
    const result = recordSynthesisBuildResponse({
      request: context.request, requestArtifact: context.requestArtifact.binding,
      responseValue: response.value, responseArtifact: response.binding,
      envelope: context.envelope, envelopeArtifact: context.envelopeArtifact.binding,
      sources: context.sources, policy: context.policy, outletIdentityTable: context.outlets, recordedAt
    });
    if (!result.ok) throw new Error(`Build response rejected: ${result.error}`);
  } else {
    const context = await loadChallengeRequestContext(root, requestPath);
    const result = recordChallengeResponse({
      request: context.request, requestArtifact: context.requestArtifact.binding,
      responseValue: response.value, responseArtifact: response.binding,
      buildRecord: context.build.record, buildRecordArtifact: context.build.recordArtifact.binding, recordedAt
    });
    if (!result.ok) throw new Error(`Challenge response rejected: ${result.error}`);
  }
};

/** Bounded execution reopens approvals and reconstructs the human-owned note, not just its shape. */
export const verifySynthesisSourceAuthority = async (root: string, binding: ArtifactBinding, usedAt: string) => {
  const artifact = await reopenSynthesisBinding(root, binding, "Source note");
  const parsed = validateSynthesisSourceNote(artifact.value);
  if (!parsed.ok) throw new Error(`Source note rejected: ${parsed.error}`);
  const note = parsed.value;
  if (Date.parse(note.assembledAt) > Date.parse(usedAt)) {
    throw new Error("Source note was assembled after the execution authority.");
  }
  const lineage = note.lineage;
  const question = await loadRssQuestion(root, lineage.researchQuestion.artifactRef, usedAt);
  if (question.artifactSha256 !== lineage.researchQuestion.artifactSha256 ||
      question.runId !== note.runId || question.id !== note.researchQuestionId) {
    throw new Error("Source note approved intent does not match its lineage.");
  }
  const context = await loadCommitContext(root, lineage.extractCommit.artifactRef);
  requireChecksum(context.commitArtifact, lineage.extractCommit.artifactSha256, "Extract commit");
  const admitted = await loadAdmittedSource(root, lineage.snapshot.artifactRef, usedAt);
  const packageArtifact = await reopenSynthesisBinding(root, lineage.reviewPackage, "Review package");
  const reviewPackage = validateReviewPackage(packageArtifact.value, context.policy);
  const recordArtifact = await reopenSynthesisBinding(root, lineage.reviewRecord, "Review record");
  const reviewRecord = validateReviewRecord(recordArtifact.value, context.policy);
  if (!reviewPackage.ok || !reviewRecord.ok) throw new Error("Source note support-review lineage is invalid.");
  const response = await reopenSynthesisBinding(root, lineage.reviewResponse, "Review response");
  const expectedReview = recordReview({
    reviewPackage: reviewPackage.value, packageArtifact: packageArtifact.binding,
    responseValue: response.value, responseArtifact: response.binding,
    document: context.document, documentArtifact: context.documentArtifact.binding,
    requirements: context.requirements, policy: context.policy, recordedAt: reviewRecord.value.recordedAt
  });
  if (!expectedReview.ok || !isDeepStrictEqual(expectedReview.value, reviewRecord.value)) {
    throw new Error("Source note support review does not reconstruct.");
  }
  const proposal = await reopenSynthesisBinding(root, {
    artifactRef: context.requirements.proposalArtifactRef,
    artifactSha256: context.requirements.proposalArtifactSha256
  }, "Requirements proposal");
  const approved = approveRequirements({
    proposalValue: proposal.value, proposalArtifactRef: proposal.binding.artifactRef,
    proposalArtifactSha256: proposal.binding.artifactSha256, researchQuestionValue: question,
    reviewerId: context.requirements.approvedBy, approvedAt: context.requirements.approvedAt
  });
  if (!approved.ok || !isDeepStrictEqual(approved.value, context.requirements) ||
      Date.parse(context.requirements.approvedAt) > Date.parse(usedAt)) {
    throw new Error("Source note requirements approval does not reconstruct.");
  }
  let supersededNote;
  if (note.supersedesNoteId) {
    const superseded = await loadRunArtifact(root, resolve(artifact.path, "..", "source-note-provisional.json"), "Superseded note");
    const value = validateSynthesisSourceNote(superseded.value);
    if (!value.ok) throw new Error("Superseded note is invalid.");
    supersededNote = value.value;
  }
  const expected = assembleSourceNote({
    admitted, commit: context.commit, commitArtifact: context.commitArtifact.binding,
    reviewPackage: reviewPackage.value, reviewRecord: reviewRecord.value,
    reviewRecordArtifact: recordArtifact.binding, requirements: context.requirements,
    policy: context.policy, assembledAt: note.assembledAt,
    ...(supersededNote ? { supersededNote } : {})
  });
  if (!expected.ok || !isDeepStrictEqual(expected.value, note)) {
    throw new Error("Source note does not reconstruct from its approved and reviewed lineage.");
  }
  return { note, artifact: artifact.binding, question };
};

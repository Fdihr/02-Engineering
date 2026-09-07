import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  keyJudgementPolicyFromStandard,
  validateMemoStandardV1
} from "../modules/memo/standard-v1.js";
import { validateChallengeRecord } from "../modules/synthesis/challenge.js";
import {
  createKeyJudgementRequest,
  validatePerformedAdjudication
} from "../modules/synthesis/key-judgement-stage.js";
import { validateSynthesisBuildRecord } from "../modules/synthesis/response.js";
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
  "Usage: npm run prepare:key-judgements -- <build-record.json> <challenge-record.json> <performed-adjudication.json> <memo-standard-v1.json>";

const describe = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const main = async (): Promise<void> => {
  const preparedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  try {
    const [buildPath, challengePath, adjudicationPath, standardPath, ...extra] =
      process.argv.slice(2);
    if (
      !buildPath ||
      !challengePath ||
      !adjudicationPath ||
      !standardPath ||
      extra.length > 0
    ) {
      throw new Error(usage);
    }
    const buildArtifact = await loadRunArtifact(
      runRoot,
      buildPath,
      "Build record"
    );
    const build = validateSynthesisBuildRecord(buildArtifact.value);
    if (!build.ok) throw new Error(`Build record rejected: ${build.error}`);
    const challengeArtifact = await loadRunArtifact(
      runRoot,
      challengePath,
      "Challenge record"
    );
    const challenge = validateChallengeRecord(challengeArtifact.value);
    if (!challenge.ok) {
      throw new Error(`Challenge record rejected: ${challenge.error}`);
    }
    const adjudicationArtifact = await loadRunArtifact(
      runRoot,
      adjudicationPath,
      "Performed adjudication"
    );
    const adjudication = validatePerformedAdjudication(
      adjudicationArtifact.value
    );
    if (!adjudication.ok) {
      throw new Error(`Adjudication rejected: ${describe(adjudication.error)}`);
    }
    requireChecksum(
      buildArtifact,
      adjudication.value.buildRecord.artifactSha256,
      "Adjudication Build record"
    );
    requireChecksum(
      challengeArtifact,
      adjudication.value.challengeRecord.artifactSha256,
      "Adjudication Challenge record"
    );
    const standardArtifact = await loadJsonArtifact(resolve(standardPath));
    const standard = validateMemoStandardV1(standardArtifact.value);
    if (!standard.ok) {
      throw new Error(`Memo standard rejected: ${standard.error}`);
    }
    const request = createKeyJudgementRequest({
      buildRecord: build.value,
      buildRecordArtifact: buildArtifact.binding,
      challengeRecord: challenge.value,
      challengeRecordArtifact: challengeArtifact.binding,
      adjudication: adjudication.value,
      adjudicationArtifact: adjudicationArtifact.binding,
      memoStandardArtifact: standardArtifact.binding,
      policy: keyJudgementPolicyFromStandard(standard.value),
      preparedAt
    });
    if (!request.ok) {
      throw new Error(
        `Key-judgement request rejected: ${describe(request.error)}`
      );
    }
    const directory = resolve(
      runRoot,
      request.value.runId,
      "synthesis",
      "key-judgements",
      "requests",
      request.value.id
    );
    await ensureDirectory(directory);
    const output = await writeJsonOnce(
      resolve(directory, "key-judgement-request.json"),
      request.value
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(
          resolve(
            runRoot,
            request.value.runId,
            "synthesis",
            "key-judgements",
            "events.jsonl"
          )
        ),
        `${JSON.stringify({
          runId: request.value.runId,
          occurredAt: preparedAt,
          actorType: "controller",
          stage: "key_judgement_selection",
          eventType: "key-judgement.request.prepared",
          status: "completed",
          artifactRef: output,
          policyId: request.value.policy.policyId,
          maxKeyJudgements: request.value.policy.maxKeyJudgements
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${request.value.runId}`);
    console.log(`Key-judgement request: ${request.value.id}`);
    console.log(`Eligible claims: ${request.value.claims.length}`);
    console.log(
      `Requirements with no eligible claim: ${request.value.eligibility.requirementsWithoutEligibleClaim.length}`
    );
    console.log(`Maximum key judgements: ${request.value.policy.maxKeyJudgements}`);
    console.log(`Output: ${output}`);
  } catch (error) {
    console.error(`Key-judgement preparation failed: ${commandError(error)}`);
    process.exitCode = 1;
  }
};

await main();
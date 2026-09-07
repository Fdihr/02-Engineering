import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  keyJudgementPolicyFromStandard,
  validateMemoStandardV1
} from "../modules/memo/standard-v1.js";
import { canonicalJson } from "../modules/assurance/validators.js";
import { validateChallengeRecord } from "../modules/synthesis/challenge.js";
import {
  createKeyJudgementRequest,
  recordKeyJudgementResponse,
  validateKeyJudgementRequest,
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
  "Usage: npm run record:key-judgements -- <key-judgement-request.json> <copilot-response.json>";

const describe = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const main = async (): Promise<void> => {
  const recordedAt = new Date().toISOString();
  const runRoot = assuranceRunRoot();
  let runId: string | undefined;
  let responseArtifactRef: string | undefined;
  try {
    const [requestPath, responsePath, ...extra] = process.argv.slice(2);
    if (!requestPath || !responsePath || extra.length > 0) {
      throw new Error(usage);
    }
    const requestArtifact = await loadRunArtifact(
      runRoot,
      requestPath,
      "Key-judgement request"
    );
    const request = validateKeyJudgementRequest(requestArtifact.value);
    if (!request.ok) {
      throw new Error(`Request rejected: ${describe(request.error)}`);
    }
    runId = request.value.runId;
    const buildArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        request.value.buildRecord.artifactRef,
        "Build record"
      ),
      request.value.buildRecord.artifactSha256,
      "Build record"
    );
    const build = validateSynthesisBuildRecord(buildArtifact.value);
    if (!build.ok) throw new Error(`Build record rejected: ${build.error}`);
    const challengeArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        request.value.challengeRecord.artifactRef,
        "Challenge record"
      ),
      request.value.challengeRecord.artifactSha256,
      "Challenge record"
    );
    const challenge = validateChallengeRecord(challengeArtifact.value);
    if (!challenge.ok) {
      throw new Error(`Challenge record rejected: ${challenge.error}`);
    }
    const adjudicationArtifact = requireChecksum(
      await loadRunArtifact(
        runRoot,
        request.value.adjudication.artifactRef,
        "Performed adjudication"
      ),
      request.value.adjudication.artifactSha256,
      "Performed adjudication"
    );
    const adjudication = validatePerformedAdjudication(
      adjudicationArtifact.value
    );
    if (!adjudication.ok) {
      throw new Error(`Adjudication rejected: ${describe(adjudication.error)}`);
    }
    const standardArtifact = requireChecksum(
      await loadJsonArtifact(resolve(request.value.memoStandard.artifactRef)),
      request.value.memoStandard.artifactSha256,
      "Memo standard"
    );
    const standard = validateMemoStandardV1(standardArtifact.value);
    if (!standard.ok) {
      throw new Error(`Memo standard rejected: ${standard.error}`);
    }
    const policy = keyJudgementPolicyFromStandard(standard.value);
    const recomputed = createKeyJudgementRequest({
      buildRecord: build.value,
      buildRecordArtifact: buildArtifact.binding,
      challengeRecord: challenge.value,
      challengeRecordArtifact: challengeArtifact.binding,
      adjudication: adjudication.value,
      adjudicationArtifact: adjudicationArtifact.binding,
      memoStandardArtifact: standardArtifact.binding,
      policy,
      preparedAt: request.value.preparedAt
    });
    if (
      !recomputed.ok ||
      canonicalJson(recomputed.value) !== canonicalJson(request.value)
    ) {
      throw new Error(
        "Key-judgement request no longer matches its deterministic inputs."
      );
    }
    const responseArtifact = await loadRunArtifact(
      runRoot,
      responsePath,
      "Key-judgement response"
    );
    responseArtifactRef = responseArtifact.binding.artifactRef;
    const record = recordKeyJudgementResponse({
      request: request.value,
      requestArtifact: requestArtifact.binding,
      responseValue: responseArtifact.value,
      responseArtifact: responseArtifact.binding,
      buildRecord: build.value,
      challengeRecord: challenge.value,
      adjudication: adjudication.value,
      policy,
      recordedAt
    });
    if (!record.ok) {
      throw new Error(`Response rejected: ${describe(record.error)}`);
    }
    const directory = resolve(
      runRoot,
      record.value.runId,
      "synthesis",
      "key-judgements",
      "records",
      record.value.id
    );
    await ensureDirectory(directory);
    const output = await writeJsonOnce(
      resolve(directory, "key-judgement-record.json"),
      record.value
    );
    await withSyncRetry(() =>
      appendFile(
        longPath(
          resolve(
            runRoot,
            record.value.runId,
            "synthesis",
            "key-judgements",
            "events.jsonl"
          )
        ),
        `${JSON.stringify({
          runId: record.value.runId,
          occurredAt: recordedAt,
          actorType: "controller",
          stage: "key_judgement_selection",
          eventType: "key-judgement.recorded",
          status: "completed",
          artifactRef: output,
          responseArtifactRef,
          selectedCount: record.value.selection.selections.length,
          omissionCount: record.value.selection.omissions.length,
          gapCount:
            record.value.selection.requirementsWithoutEligibleClaim.length
        })}\n`,
        "utf8"
      )
    );
    console.log(`Run: ${record.value.runId}`);
    console.log(`Key-judgement record: ${record.value.id}`);
    console.log(`Selected: ${record.value.selection.selections.length}`);
    console.log(`Omitted: ${record.value.selection.omissions.length}`);
    console.log(
      `Gaps: ${record.value.selection.requirementsWithoutEligibleClaim.length}`
    );
    console.log(`Output: ${output}`);
  } catch (error) {
    const message = commandError(error);
    if (runId) {
      try {
        await withSyncRetry(() =>
          appendFile(
            longPath(
              resolve(
                runRoot,
                runId as string,
                "synthesis",
                "key-judgements",
                "events.jsonl"
              )
            ),
            `${JSON.stringify({
              runId,
              occurredAt: recordedAt,
              actorType: "controller",
              stage: "key_judgement_selection",
              eventType: "key-judgement.rejected",
              status: "failed",
              responseArtifactRef,
              error: message
            })}\n`,
            "utf8"
          )
        );
      } catch {
        // Preserve the primary deterministic recording failure.
      }
    }
    console.error(`Key-judgement recording failed: ${message}`);
    process.exitCode = 1;
  }
};

await main();
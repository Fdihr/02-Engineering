import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseRunNextAction,
  type DeterministicRunStep,
  type RunNextFacts
} from "./run-next.js";
import {
  projectWorkflow,
  type WorkflowProjectionInput
} from "./workflow-projection.js";

const base: RunNextFacts = {
  hasIntentApproval: true,
  openExceptionPaths: [],
  deterministicSteps: [],
  pendingModelRequestPaths: [],
  governanceBlockerPaths: []
};

test("run-next prioritizes pushed exceptions and deterministic work", () => {
  assert.deepEqual(
    chooseRunNextAction({ ...base, openExceptionPaths: ["runs/run-1/exceptions/e1/exception-item.json"] }),
    {
      kind: "human-wait",
      surface: "exceptions",
      paths: ["runs/run-1/exceptions/e1/exception-item.json"]
    }
  );
  assert.equal(
    chooseRunNextAction({
      ...base,
      deterministicSteps: [{
        command: "record:synthesis-build",
        requestPath: "runs/run-1/build-request.json",
        responsePath: "runs/run-1/copilot-response.json"
      }]
    }).kind,
    "execute"
  );
  assert.equal(
    chooseRunNextAction({
      ...base,
      deterministicSteps: [
        {
          command: "record:key-judgements",
          requestPath: "runs/run-1/key-judgement-request.json",
          responsePath: "runs/run-1/copilot-response.json"
        }
      ]
    }).kind,
    "execute"
  );
});

test("run-next reports only the four human surfaces and named machine wait", () => {
  assert.deepEqual(chooseRunNextAction({ ...base, hasIntentApproval: false }), {
    kind: "human-wait",
    surface: "intent",
    paths: []
  });
  assert.deepEqual(
    chooseRunNextAction({ ...base, pendingModelRequestPaths: ["runs/run-1/request.json"] }),
    {
      kind: "machine-wait",
      replacement: "foundry-adapter",
      paths: ["runs/run-1/request.json"]
    }
  );
  assert.equal(
    chooseRunNextAction({
      ...base,
      publicationGatePath: "runs/run-1/publication-gate.json",
      publicationApprovalAvailable: true
    }).kind,
    "human-wait"
  );
  assert.deepEqual(
    chooseRunNextAction({
      ...base,
      governanceBlockerPaths: ["runs/run-1/publication-gate.json"]
    }),
    {
      kind: "human-wait",
      surface: "governance",
      paths: ["runs/run-1/publication-gate.json"]
    }
  );
});

test("the projection recommends approved intermediate work before interim human checks", () => {
  const projection = projectWorkflow({
    runId: "run-1",
    intentApproved: true,
    evidenceAvailable: true,
    committedOutcomes: [{ stage: "intent", paths: ["runs/run-1/approved.json"] }],
    readyWork: [
      {
        id: "support-review",
        stage: "assure",
        actor: "human",
        kind: "decision",
        title: "Review source support",
        detail: "",
        paths: ["runs/run-1/review-package.json"],
        priority: 1
      },
      {
        id: "challenge",
        stage: "synthesise",
        actor: "machine",
        kind: "work",
        title: "Run Challenge",
        detail: "",
        paths: ["runs/run-1/challenge-request.json"],
        priority: 1
      }
    ],
    humanDecisions: [{ id: "support-review", stage: "assure", paths: [] }],
    interimCheckpoints: [{ id: "challenge", stage: "synthesise", paths: [] }],
    blockers: []
  });
  assert.equal(projection.status, "ready-machine");
  assert.equal(projection.recommendedNextAction.kind, "machine");
  assert.equal(
    projection.recommendedNextAction.kind === "machine" &&
      projection.recommendedNextAction.work.id,
    "challenge"
  );
  const runNextAction = chooseRunNextAction({
    ...base,
    pendingModelRequestPaths: ["runs/run-1/challenge-request.json"]
  });
  assert.deepEqual(runNextAction, {
    kind: "machine-wait",
    replacement: "foundry-adapter",
    paths: ["runs/run-1/challenge-request.json"]
  });
  if (projection.recommendedNextAction.kind !== "machine") {
    assert.fail("The shared projection did not recommend machine work.");
  }
  assert.deepEqual(runNextAction.paths, projection.recommendedNextAction.work.paths);
});

test("scoped exceptions pause their referenced work while unrelated work continues", () => {
  const step = (requestPath: string): DeterministicRunStep => ({
    command: "record:synthesis-build",
    requestPath,
    responsePath: requestPath.replace("request", "response")
  });
  const result = chooseRunNextAction({
    ...base,
    deterministicSteps: [step("runs/run-1/affected-request.json"), step("runs/run-1/unrelated-request.json")],
    openExceptions: [{
      path: "runs/run-1/exceptions/e1/exception-item.json",
      refs: ["runs/run-1/affected-request.json"]
    }]
  });
  assert.deepEqual(result, {
    kind: "execute",
    step: step("runs/run-1/unrelated-request.json")
  });
});

test("unknown exception scope conservatively blocks and legacy path-only exceptions remain blocking", () => {
  const unknownScope = projectWorkflow({
    runId: "run-1",
    intentApproved: true,
    evidenceAvailable: true,
    committedOutcomes: [],
    readyWork: [{
      id: "build",
      stage: "synthesise",
      actor: "machine",
      kind: "work",
      title: "Record Build",
      detail: "",
      paths: ["runs/run-1/request.json"],
      priority: 1
    }],
    humanDecisions: [],
    interimCheckpoints: [],
    blockers: [{
      id: "exception",
      kind: "exception",
      scope: "unknown",
      paths: ["runs/run-1/exceptions/e1/exception-item.json"],
      affectedWorkIds: [],
      uncertain: true,
      title: "Unknown exception scope",
      detail: "Affected work cannot be established."
    }]
  });
  assert.equal(unknownScope.readyWork.length, 0);
  assert.equal(unknownScope.status, "blocked");
  assert.deepEqual(
    chooseRunNextAction({
      ...base,
      deterministicSteps: [{
        command: "record:synthesis-build",
        requestPath: "runs/run-1/request.json",
        responsePath: "runs/run-1/response.json"
      }],
      openExceptions: [{
        path: "runs/run-1/exceptions/e1/exception-item.json",
        refs: ["runs/run-1/unrecognized-artifact.json"]
      }]
    }),
    {
      kind: "human-wait",
      surface: "exceptions",
      paths: [
        "runs/run-1/exceptions/e1/exception-item.json",
        "runs/run-1/unrecognized-artifact.json"
      ]
    }
  );
  assert.equal(
    chooseRunNextAction({ ...base, openExceptionPaths: ["runs/run-1/exceptions/legacy.json"] }).kind,
    "human-wait"
  );
});

test("no evidence and publication gate states remain distinct", () => {
  const empty: WorkflowProjectionInput = {
    runId: "run-empty",
    intentApproved: true,
    evidenceAvailable: false,
    committedOutcomes: [],
    readyWork: [],
    humanDecisions: [],
    interimCheckpoints: [],
    blockers: []
  };
  const noEvidence = projectWorkflow(empty);
  assert.equal(noEvidence.status, "no-evidence");
  assert.deepEqual(noEvidence.recommendedNextAction, {
    kind: "human",
    surface: "collection",
    paths: []
  });
  assert.equal(projectWorkflow({
    ...empty,
    readyWork: [{
      id: "collect",
      stage: "collect",
      actor: "human",
      kind: "checkpoint",
      surface: "collection",
      title: "Collect bounded leads",
      detail: "",
      paths: [],
      priority: 1
    }]
  }).status, "no-evidence");

  const publicationBlocker = {
    id: "PROVISIONAL_SOURCE_LINEAGE",
    kind: "publication" as const,
    scope: "publication" as const,
    paths: ["runs/run-1/publication-gate.json"],
    affectedWorkIds: [],
    uncertain: false,
    title: "Provisional source lineage",
    detail: "The current memo is not publishable."
  };
  const stillWorking = projectWorkflow({
    ...empty,
    evidenceAvailable: true,
    readyWork: [{
      id: "memo-writer",
      stage: "memo",
      actor: "machine",
      kind: "work",
      title: "Write memo",
      detail: "",
      paths: [],
      priority: 1
    }],
    blockers: [publicationBlocker]
  });
  assert.equal(stillWorking.recommendedNextAction.kind, "machine");
  const blockedPublication = projectWorkflow({
    ...empty,
    evidenceAvailable: true,
    blockers: [publicationBlocker]
  });
  assert.equal(blockedPublication.status, "blocked");
  assert.equal(blockedPublication.readyWork.length, 0);
  assert.equal(
    blockedPublication.recommendedNextAction.kind === "blocked" &&
      blockedPublication.recommendedNextAction.blocker.scope,
    "publication"
  );
  const readyPublication = projectWorkflow({
    ...empty,
    evidenceAvailable: true,
    publication: { path: "runs/run-1/publication-gate.json", approvalAvailable: true }
  });
  assert.deepEqual(readyPublication.recommendedNextAction, {
    kind: "human",
    surface: "publication",
    paths: ["runs/run-1/publication-gate.json"]
  });
});
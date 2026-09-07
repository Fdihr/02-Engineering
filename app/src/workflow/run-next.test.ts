import assert from "node:assert/strict";
import test from "node:test";
import { chooseRunNextAction, type RunNextFacts } from "./run-next.js";

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
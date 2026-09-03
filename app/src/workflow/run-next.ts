export type DeterministicRunStep = {
  command: "record:synthesis-build" | "record:synthesis-challenge" | "record:memo-writer";
  requestPath: string;
  responsePath: string;
};

export type RunNextFacts = {
  hasIntentApproval: boolean;
  openExceptionPaths: string[];
  deterministicSteps: DeterministicRunStep[];
  pendingModelRequestPaths: string[];
  publicationGatePath?: string;
  publicationApprovalAvailable?: boolean;
  governanceBlockerPaths: string[];
};

export type RunNextAction =
  | { kind: "execute"; step: DeterministicRunStep }
  | { kind: "human-wait"; surface: "intent" | "publication" | "exceptions" | "governance"; paths: string[] }
  | { kind: "machine-wait"; replacement: "foundry-adapter"; paths: string[] }
  | { kind: "complete" };

export const chooseRunNextAction = (facts: RunNextFacts): RunNextAction => {
  if (facts.openExceptionPaths.length > 0) {
    return {
      kind: "human-wait",
      surface: "exceptions",
      paths: [...facts.openExceptionPaths].sort()
    };
  }
  if (!facts.hasIntentApproval) {
    return { kind: "human-wait", surface: "intent", paths: [] };
  }
  const deterministic = [...facts.deterministicSteps].sort((left, right) =>
    left.requestPath.localeCompare(right.requestPath)
  )[0];
  if (deterministic) {
    return { kind: "execute", step: deterministic };
  }
  if (facts.pendingModelRequestPaths.length > 0) {
    return {
      kind: "machine-wait",
      replacement: "foundry-adapter",
      paths: [...facts.pendingModelRequestPaths].sort()
    };
  }
  if (facts.publicationGatePath && facts.publicationApprovalAvailable) {
    return {
      kind: "human-wait",
      surface: "publication",
      paths: [facts.publicationGatePath]
    };
  }
  if (facts.governanceBlockerPaths.length > 0) {
    return {
      kind: "human-wait",
      surface: "governance",
      paths: [...facts.governanceBlockerPaths].sort()
    };
  }
  return { kind: "complete" };
};
export type WorkflowStage =
  | "intent"
  | "collect"
  | "evidence"
  | "assure"
  | "synthesise"
  | "memo"
  | "publication";

export type WorkflowWork = {
  id: string;
  stage: WorkflowStage;
  actor: "machine" | "human";
  kind: "work" | "decision" | "checkpoint";
  surface?: "exceptions" | "governance" | "publication" | "collection" | "workflow";
  title: string;
  detail: string;
  paths: string[];
  priority: number;
  target?: Record<string, unknown>;
};

export type WorkflowBlocker = {
  id: string;
  kind: "exception" | "integrity" | "publication" | "evidence";
  scope: "work" | "run" | "publication" | "unknown";
  paths: string[];
  affectedWorkIds: string[];
  uncertain: boolean;
  title: string;
  detail: string;
};

export type WorkflowProjectionInput = {
  runId: string;
  intentApproved: boolean;
  evidenceAvailable: boolean;
  committedOutcomes: Array<{ stage: WorkflowStage; paths: string[] }>;
  readyWork: WorkflowWork[];
  humanDecisions: Array<{ id: string; stage: WorkflowStage; paths: string[] }>;
  interimCheckpoints: Array<{ id: string; stage: WorkflowStage; paths: string[] }>;
  blockers: WorkflowBlocker[];
  publication?: { path: string; approvalAvailable: boolean };
};

export type WorkflowRecommendation =
  | { kind: "human"; surface: "intent" | "exceptions" | "governance" | "publication" | "collection" | "workflow"; paths: string[]; work?: WorkflowWork }
  | { kind: "machine"; work: WorkflowWork }
  | { kind: "blocked"; blocker: WorkflowBlocker }
  | { kind: "complete" };

export type WorkflowProjection = {
  runId: string;
  currentStage: WorkflowStage;
  status: "needs-intent" | "blocked" | "ready-machine" | "waiting-human" | "no-evidence" | "complete";
  committedOutcomes: WorkflowProjectionInput["committedOutcomes"];
  readyWork: WorkflowWork[];
  humanDecisions: WorkflowProjectionInput["humanDecisions"];
  interimCheckpoints: WorkflowProjectionInput["interimCheckpoints"];
  blockers: WorkflowBlocker[];
  recommendedNextAction: WorkflowRecommendation;
};

const STAGE_ORDER: WorkflowStage[] = [
  "intent",
  "collect",
  "evidence",
  "assure",
  "synthesise",
  "memo",
  "publication"
];

const sortPaths = (paths: string[]): string[] => [...new Set(paths)].sort();

export const projectWorkflow = (input: WorkflowProjectionInput): WorkflowProjection => {
  const blockers = input.blockers.map((blocker) => ({
    ...blocker,
    paths: sortPaths(blocker.paths),
    affectedWorkIds: [...new Set(blocker.affectedWorkIds)].sort()
  })).sort((left, right) =>
    left.id.localeCompare(right.id) || left.paths.join("\0").localeCompare(right.paths.join("\0"))
  );
  const activeRunBlocker = blockers.find(
    (blocker) => blocker.scope === "run" || blocker.scope === "unknown"
  );
  const publicationBlocker = blockers.find((blocker) => blocker.scope === "publication");
  const blockedWorkIds = new Set(
    blockers.filter((blocker) => blocker.scope === "work").flatMap((blocker) => blocker.affectedWorkIds)
  );
  const publicationBlocked = blockers.some((blocker) => blocker.scope === "publication");
  const availableWork = input.readyWork
    .map((work) => ({ ...work, paths: sortPaths(work.paths) }))
    .filter((work) =>
      !blockedWorkIds.has(work.id) &&
      !(publicationBlocked && work.stage === "publication")
    )
    .sort((left, right) =>
      right.priority - left.priority ||
      Number(right.actor === "machine") - Number(left.actor === "machine") ||
      STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage) ||
      left.id.localeCompare(right.id)
    );
  const readyWork = activeRunBlocker ? [] : availableWork;

  let recommendedNextAction: WorkflowRecommendation;
  if (!input.intentApproved) {
    recommendedNextAction = { kind: "human", surface: "intent", paths: [] };
  } else if (activeRunBlocker) {
    recommendedNextAction = {
      kind: "blocked",
      blocker: activeRunBlocker
    };
  } else if (readyWork[0]) {
    const work = readyWork[0];
    recommendedNextAction =
      work.actor === "machine"
        ? { kind: "machine", work }
        : {
            kind: "human",
            surface: work.surface ?? (work.stage === "publication" ? "publication" : "workflow"),
            paths: work.paths,
            work
          };
  } else if (publicationBlocker) {
    recommendedNextAction = { kind: "blocked", blocker: publicationBlocker };
  } else if (input.publication?.approvalAvailable) {
    recommendedNextAction = {
      kind: "human",
      surface: "publication",
      paths: [input.publication.path]
    };
  } else if (!input.evidenceAvailable) {
    recommendedNextAction = { kind: "human", surface: "collection", paths: [] };
  } else {
    recommendedNextAction = { kind: "complete" };
  }

  const currentStage =
    recommendedNextAction.kind === "machine" || recommendedNextAction.kind === "human"
      ? recommendedNextAction.kind === "human" && !recommendedNextAction.work
        ? recommendedNextAction.surface === "intent"
          ? "intent"
          : recommendedNextAction.surface === "collection"
            ? "collect"
            : "publication"
        : recommendedNextAction.work?.stage ?? "intent"
      : input.committedOutcomes
          .map((outcome) => outcome.stage)
          .sort((left, right) => STAGE_ORDER.indexOf(right) - STAGE_ORDER.indexOf(left))[0] ?? "intent";
  const collectionNext =
    recommendedNextAction.kind === "human" &&
    (recommendedNextAction.surface === "collection" || recommendedNextAction.work?.stage === "collect");
  const status: WorkflowProjection["status"] =
    recommendedNextAction.kind === "blocked"
      ? "blocked"
      : input.intentApproved && !input.evidenceAvailable && collectionNext
        ? "no-evidence"
      : recommendedNextAction.kind === "machine"
        ? "ready-machine"
        : recommendedNextAction.kind === "human"
          ? recommendedNextAction.surface === "intent"
            ? "needs-intent"
            : recommendedNextAction.surface === "collection"
              ? "no-evidence"
              : "waiting-human"
          : !input.evidenceAvailable
            ? "no-evidence"
            : "complete";

  return {
    runId: input.runId,
    currentStage,
    status,
    committedOutcomes: input.committedOutcomes
      .map((outcome) => ({ ...outcome, paths: sortPaths(outcome.paths) }))
      .sort((left, right) =>
        STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage) ||
        left.paths.join("\0").localeCompare(right.paths.join("\0"))
      ),
    readyWork,
    humanDecisions: input.humanDecisions
      .map((item) => ({ ...item, paths: sortPaths(item.paths) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    interimCheckpoints: input.interimCheckpoints
      .map((item) => ({ ...item, paths: sortPaths(item.paths) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    blockers,
    recommendedNextAction
  };
};

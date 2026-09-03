export type AssuranceEventStep =
  | "requirements_approval"
  | "extract_request"
  | "extract_record"
  | "review_package"
  | "review_record"
  | "note_assembly"
  | "measurement"
  | "exception";

/** Event fields are deliberately content-free: no prompts, quotes, or observation text. */
export type AssuranceEvent = {
  runId?: string;
  snapshotId?: string;
  occurredAt: string;
  actorType: "controller" | "human";
  actorId?: string;
  stage: "source_assurance";
  step: AssuranceEventStep;
  eventType: string;
  status: "completed" | "failed";
  attempt?: number;
  artifactRef?: string;
  artifactSha256?: string;
  error?: string;
};

export const createAssuranceEvent = (
  input: Omit<AssuranceEvent, "stage">
): AssuranceEvent =>
  Object.fromEntries(
    Object.entries({ ...input, stage: "source_assurance" as const }).filter(
      ([, entry]) => entry !== undefined
    )
  ) as AssuranceEvent;

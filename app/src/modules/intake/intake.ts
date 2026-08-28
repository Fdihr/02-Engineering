import type { SourceRecord } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";

export type IntakeError = "MISSING_ID" | "MISSING_TITLE" | "MISSING_BODY";

export const validateSource = (input: Partial<SourceRecord>): Result<SourceRecord, IntakeError> => {
  if (!input.sourceId?.trim()) {
    return err("MISSING_ID");
  }
  if (!input.title?.trim()) {
    return err("MISSING_TITLE");
  }
  if (!input.body?.trim()) {
    return err("MISSING_BODY");
  }

  return ok({
    sourceId: input.sourceId,
    title: input.title,
    body: input.body,
    confidentiality: input.confidentiality ?? "internal"
  });
};

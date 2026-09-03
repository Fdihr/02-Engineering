import { err, ok, type Result } from "../../core/result.js";
import type { SourceNote } from "../assurance/types.js";

export type PublicationCheckError =
  | "PROVISIONAL_SOURCE_LINEAGE"
  | "SYNTHETIC_SOURCE_LINEAGE";

export const verifyPublicationEligibility = (
  sourceNotes: SourceNote[]
): Result<{ status: "eligible" }, PublicationCheckError> =>
  sourceNotes.some((note) => note.reviewStatus === "synthetic")
    ? err("SYNTHETIC_SOURCE_LINEAGE")
    : sourceNotes.some((note) => note.reviewStatus === "provisional")
      ? err("PROVISIONAL_SOURCE_LINEAGE")
      : ok({ status: "eligible" });
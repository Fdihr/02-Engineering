import type { CapturedSourceContent, SourceArtifactLineage } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import type { RssCapture } from "../collection/rss-capture.js";

export const adaptRssSourceContent = (
  verifiedCapture: RssCapture, itemId: string, captureBinding: SourceArtifactLineage
): Result<CapturedSourceContent, "RSS_ITEM_NOT_FOUND" | "RSS_ITEM_IS_LEAD_ONLY" | "RSS_ITEM_OUTSIDE_WINDOW"> => {
  const item = verifiedCapture.items.find(entry => entry.id === itemId);
  if (!item) return err("RSS_ITEM_NOT_FOUND");
  if (item.contentStatus !== "captured-feed-text" || !item.body || !item.articleUrl) return err("RSS_ITEM_IS_LEAD_ONLY");
  if (item.timeStatus !== "in-window") return err("RSS_ITEM_OUTSIDE_WINDOW");
  return ok({
    runId: verifiedCapture.runId, sourceItemId: item.id,
    sourceKind: "rss-feed", contentFormat: "plain-text", body: item.body,
    sourceArtifactRef: captureBinding.artifactRef,
    sourceArtifactSha256: captureBinding.artifactSha256,
    lineageArtifactRefs: [
      { artifactRef: verifiedCapture.researchQuestion.artifactRef,
        artifactSha256: verifiedCapture.researchQuestion.artifactSha256 },
      ...Object.values(verifiedCapture.lineage)
    ]
  });
};

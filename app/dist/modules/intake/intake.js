import { err, ok } from "../../core/result.js";
export const validateSource = (input) => {
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

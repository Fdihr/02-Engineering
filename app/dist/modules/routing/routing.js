export const decideRoute = (source) => {
    const lowered = `${source.title} ${source.body}`.toLowerCase();
    if (source.confidentiality === "restricted") {
        return {
            sourceId: source.sourceId,
            destination: "archive",
            ruleId: "RULE-RESTRICTED-001",
            reason: "Restricted sources are archived for controlled handling"
        };
    }
    if (lowered.includes("executive summary") || lowered.includes("final report")) {
        return {
            sourceId: source.sourceId,
            destination: "approved",
            ruleId: "RULE-READY-002",
            reason: "Content appears delivery-ready"
        };
    }
    return {
        sourceId: source.sourceId,
        destination: "analysis",
        ruleId: "RULE-DEFAULT-003",
        reason: "Default route for analyst review"
    };
};

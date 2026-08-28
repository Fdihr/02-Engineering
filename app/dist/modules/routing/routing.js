export const decideRoute = (source) => {
    if (source.confidentiality === "restricted") {
        return {
            sourceId: source.sourceId,
            destination: "archive",
            ruleId: "RULE-RESTRICTED-001",
            reason: "Restricted sources are archived for controlled handling"
        };
    }
    return {
        sourceId: source.sourceId,
        destination: "analysis",
        ruleId: "RULE-HUMAN-REVIEW-002",
        reason: "Non-restricted sources require human review before approval"
    };
};

export type ModelIdentity = {
  provider: "github-copilot-vscode" | "github-copilot-sdk";
  model: string;
};

export const readModelIdentity = (value: {
  provider?: unknown;
  model?: unknown;
}): ModelIdentity | undefined => {
  if (
    value.provider === "github-copilot-vscode" &&
    value.model === "not-exposed-by-host"
  ) {
    return { provider: value.provider, model: value.model };
  }
  if (
    value.provider === "github-copilot-sdk" &&
    typeof value.model === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value.model) &&
    value.model !== "not-exposed-by-host" &&
    value.model !== "auto"
  ) {
    return { provider: value.provider, model: value.model };
  }
  return undefined;
};

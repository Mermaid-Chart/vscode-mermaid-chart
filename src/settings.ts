import * as vscode from "vscode";

const configSection = "mermaidChart";

export const enableTelemetrySetting = `${configSection}.enableTelemetry`;

/** On by default; requires both this setting and VS Code's own telemetry level to be enabled. */
export function isMermaidTelemetryEnabled(): boolean {
  return (
    vscode.env.isTelemetryEnabled &&
    vscode.workspace.getConfiguration(configSection).get<boolean>("enableTelemetry", true)
  );
}

// Passing undefined clears the override so the setting falls back to its default.
export async function updateTelemetrySetting(value: boolean | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration(configSection)
    .update("enableTelemetry", value, vscode.ConfigurationTarget.Global);
}

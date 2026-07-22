import * as vscode from 'vscode';

export const DEFAULT_MERMAID_CHART_BASE_URL = 'https://mermaid.ai';

export function getMermaidChartBaseUrl(): string {
  return (
    vscode.workspace
      .getConfiguration('mermaidChart')
      .get<string>('baseUrl', DEFAULT_MERMAID_CHART_BASE_URL) ??
    DEFAULT_MERMAID_CHART_BASE_URL
  );
}

/** Snapshot of base URL at module load (same behaviour as the old util export). */
export const defaultBaseURL = getMermaidChartBaseUrl();

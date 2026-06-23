import * as vscode from "vscode";
import { OPEN_REVIEW_COMMAND } from "./botEditCodeLensProvider";

/**
 * Handles `vscode://MermaidChart.vscode-mermaid-chart/review?...` deep links.
 *
 * This is the inbound half of the PR-review loop: the Mermaid Sync bot posts a
 * comment on the PR whose "Open the fuller review" link points at the service's
 * landing page, which in turn hands off here via this `vscode://` URI. We map
 * the repo-relative diagram path to a file in the open workspace and run the
 * normal review command on it.
 *
 * Query params (all optional except `file` for a targeted open):
 *   owner, repo, pr, file
 */
export async function handleReviewDeepLink(uri: vscode.Uri): Promise<void> {
  const params = new URLSearchParams(uri.query);
  const owner = params.get("owner") ?? "";
  const repo = params.get("repo") ?? "";
  const pr = params.get("pr") ?? "";
  const file = params.get("file") ?? "";

  if (!file) {
    void vscode.window.showWarningMessage(
      "Mermaid Sync: review link did not specify a diagram to open.",
    );
    return;
  }

  const target = await locateWorkspaceFile(file);
  if (!target) {
    const openPr = "Open PR on GitHub";
    const choice = await vscode.window.showWarningMessage(
      `Mermaid Sync: couldn't find "${file}" in your open workspace. ` +
        `Open the repository ${owner}/${repo} and check out the PR branch, then try again.`,
      openPr,
    );
    if (choice === openPr && owner && repo && pr) {
      void vscode.env.openExternal(
        vscode.Uri.parse(`https://github.com/${owner}/${repo}/pull/${pr}`),
      );
    }
    return;
  }

  await vscode.commands.executeCommand(OPEN_REVIEW_COMMAND, target);
}

/**
 * Find a file in the open workspace by its repo-relative path. Tries an exact
 * join against each workspace folder first, then falls back to a suffix match
 * (handles the repo root not being the workspace root).
 */
async function locateWorkspaceFile(
  relativePath: string,
): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const normalized = relativePath.replace(/^[\/\\]+/, "");

  for (const folder of folders) {
    const candidate = vscode.Uri.joinPath(folder.uri, normalized);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  // Fallback: search by basename and match the path suffix.
  const basename = normalized.split("/").pop() ?? normalized;
  const matches = await vscode.workspace.findFiles(
    `**/${basename}`,
    "**/node_modules/**",
    20,
  );
  return matches.find((m) => m.path.endsWith(normalized)) ?? matches[0];
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

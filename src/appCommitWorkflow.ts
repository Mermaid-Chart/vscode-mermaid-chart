import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { AppReviewIntegration } from "./appReviewIntegration";
import type { AppReviewGitStatusTracker } from "./appReviewGitStatus";
import type { GitExtensionExports } from "./types";
import { pathsEqualAbsolute, toPosixRepoPath } from "./appReviewPaths";

function runGit(cwd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/**
 * Push using the built-in Git extension so the same credentials / askpass as the Source Control view apply.
 * Raw `git push` from spawn has no TTY and often fails on HTTPS with "could not read Username".
 */
async function pushWithBuiltInGitExtension(gitRoot: string): Promise<void> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!ext) {
    throw new Error(
      "VS Code Git extension is not available. Push from the Source Control view or install Git credentials (e.g. Git Credential Manager)."
    );
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  const api = ext.exports.getAPI(1);
  const norm = path.normalize(gitRoot);
  let repo = api.repositories.find((r) => pathsEqualAbsolute(r.rootUri.fsPath, norm));
  if (!repo && api.repositories.length === 1) {
    repo = api.repositories[0];
  }
  if (!repo) {
    throw new Error(
      `Git extension has no open repository for ${gitRoot}. Open that folder as the workspace root and try again.`
    );
  }
  await repo.push();
}

export class AppCommitWorkflow {
  constructor(
    private readonly appReviewIntegration: AppReviewIntegration,
    private readonly gitStatusTracker: AppReviewGitStatusTracker
  ) {}

  async commitAppReview(fileUri: vscode.Uri): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    if (!root) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const abs = fileUri.fsPath;
    if (!this.gitStatusTracker.isDirtyForFile(abs)) {
      vscode.window.showInformationMessage(
        "No uncommitted changes for this file (git status clean). Nothing to commit."
      );
      return;
    }

    const fileName = path.basename(abs);

    try {

      const gitRoot = (await this.appReviewIntegration.resolveGitRepositoryRoot(root)) ?? path.normalize(root);
      const mapping = this.appReviewIntegration.getReviewMapping(abs);
      const rel = mapping?.relativePath ?? toPosixRepoPath(path.relative(gitRoot, abs));
      if (!rel || rel.startsWith("..")) {
        vscode.window.showErrorMessage("File is not under the git repository root.");
        return;
      }

      const normalizedRels = [rel];
      const wantMermaidIgnore = await this.promptMermaidIgnoreBeforeCommit(normalizedRels);
      if (wantMermaidIgnore === null) {
        vscode.window.showInformationMessage("Commit cancelled");
        return;
      }
      let mermaidIgnorePreview: { changed: boolean; nextContent: string; ignorePath: string } | null =
        null;
      if (wantMermaidIgnore) {
        mermaidIgnorePreview = await this.readMermaidIgnoreMergePreview(gitRoot, normalizedRels);
        if (!mermaidIgnorePreview.changed) {
          vscode.window.showInformationMessage(
            ".mermaidignore already lists this path. Only your diagram changes will be committed."
          );
        }
      }

      const commitMessage = await this.getCommitMessage(fileName);
      if (!commitMessage) {
        vscode.window.showInformationMessage("Commit cancelled");
        return;
      }

      if (wantMermaidIgnore && mermaidIgnorePreview?.changed) {
        await fs.writeFile(mermaidIgnorePreview.ignorePath, mermaidIgnorePreview.nextContent, "utf8");
      }

      const stage = await runGit(gitRoot, ["add", "--", rel]);
      if (stage.code !== 0) {
        throw new Error(stage.stderr || `git add failed (${stage.code})`);
      }

      if (wantMermaidIgnore && mermaidIgnorePreview?.changed) {
        const ign = await runGit(gitRoot, ["add", "--", ".mermaidignore"]);
        if (ign.code !== 0) {
          throw new Error(ign.stderr || `git add .mermaidignore failed (${ign.code})`);
        }
      }

      const commit = await runGit(gitRoot, ["commit", "-m", commitMessage]);
      if (commit.code !== 0) {
        throw new Error(commit.stderr || `git commit failed (${commit.code})`);
      }

      void this.gitStatusTracker.refreshPath(abs);
      await this.askAboutPush(gitRoot, [abs]);

      vscode.window.showInformationMessage(`Committed changes for ${fileName}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Commit failed: ${error}`);
    }
  }

  private async getCommitMessage(fileName: string): Promise<string | undefined> {
    const defaultMessage = `Review Mermaid Sync app diagram changes (${fileName})`;
    const commitMessage = await vscode.window.showInputBox({
      prompt: "Commit message",
      value: defaultMessage,
      valueSelection: [0, defaultMessage.length],
      placeHolder: "Describe your review outcome…",
      validateInput: (value) => {
        if (!value?.trim()) {
          return "Message cannot be empty";
        }
        if (value.trim().length < 3) {
          return "Message must be at least 3 characters";
        }
        return null;
      },
    });
    return commitMessage?.trim();
  }

  /**
   * Shown when the user chooses Commit, before the single commit message.
   * @returns true to add `.mermaidignore`, false to commit diagram only, null if cancelled.
   */
  private async promptMermaidIgnoreBeforeCommit(normalizedRels: string[]): Promise<boolean | null> {
    if (normalizedRels.length === 0) {
      return false;
    }

    // `detail` in MessageOptions is ignored unless modal: true (VS Code API). Put everything in `message`.
    const message = [
      "Add diagram path(s) to .mermaidignore?",
      "",
      "The Mermaid Sync app may update these files again when source files change, which can overwrite your edits.",
      "",
      "• Accept — add the path(s) to `.mermaidignore` at the repo root in the same commit as your diagram edits.",
      "• Reject — commit diagram edits only; no `.mermaidignore` changes.",
      "• Cancel — abort commit.",
    ].join("\n");

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Accept",
      "Reject",
    );
    if (choice === undefined) {
      return null;
    }
    return choice === "Accept";
  }

  /**
   * Reads `.mermaidignore` and computes merged content if new paths would be appended.
   * Does not write to disk until the caller writes `nextContent`.
   */
  private async readMermaidIgnoreMergePreview(
    gitRoot: string,
    relPosixPaths: string[]
  ): Promise<{ changed: boolean; nextContent: string; ignorePath: string }> {
    const ignorePath = path.join(gitRoot, ".mermaidignore");
    let body = "";
    try {
      body = await fs.readFile(ignorePath, "utf8");
    } catch {
      body = "";
    }

    const existing = new Set<string>();
    for (const line of body.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) {
        continue;
      }
      existing.add(t.replace(/\\/g, "/"));
    }

    const toAdd = relPosixPaths.filter((p) => !existing.has(p));
    if (toAdd.length === 0) {
      return { changed: false, nextContent: body, ignorePath };
    }

    let out = body;
    if (out.length > 0 && !out.endsWith("\n")) {
      out += "\n";
    }
    for (const p of toAdd) {
      out += `${p}\n`;
    }
    return { changed: true, nextContent: out, ignorePath };
  }

  private async askAboutPush(cwd: string, absolutePathsToClearOnPush: string[]): Promise<void> {
    const pushAction = await vscode.window.showInformationMessage(
      [
        "Push to GitHub?",
        "",
        "Pushes unpushed commits on this branch using the same Git push as the Source Control view (your GitHub / credential helper).",
      ].join("\n"),
      { modal: false },
      "Push Now",
      "Later"
    );

    if (pushAction === "Push Now") {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Pushing to remote…",
            cancellable: false,
          },
          async () => {
            await pushWithBuiltInGitExtension(cwd);
          }
        );
        vscode.window.showInformationMessage("Push finished.");
        for (const p of absolutePathsToClearOnPush) {
          this.appReviewIntegration.removeReviewForFile(p);
          this.gitStatusTracker.invalidatePath(p);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(
          `Push failed: ${msg}`,
          "Open Source Control"
        ).then((choice) => {
          if (choice === "Open Source Control") {
            void vscode.commands.executeCommand("workbench.view.scm");
          }
        });
      }
    }
  }
}

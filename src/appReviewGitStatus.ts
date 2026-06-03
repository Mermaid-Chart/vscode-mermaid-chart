import * as vscode from "vscode";
import { spawn } from "child_process";
import type { AppReviewIntegration } from "./appReviewIntegration";

const GIT_STATUS_TIMEOUT_MS = 15_000;

function runGitStdout(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`git ${args.join(" ")} timed out after ${GIT_STATUS_TIMEOUT_MS}ms`));
      }
    }, GIT_STATUS_TIMEOUT_MS);

    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 1, stdout, stderr });
      }
    });
  });
}

/**
 * Tracks `git status --porcelain` per reviewed file so CodeLens can show Commit only when dirty.
 * Uses each mapping's `relativePath` (git index casing) for pathspecs.
 */
export class AppReviewGitStatusTracker implements vscode.Disposable {
  private readonly dirtyByRepoRelativePath = new Map<string, boolean>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _onDidChangeDirty = new vscode.EventEmitter<void>();
  readonly onDidChangeDirty = this._onDidChangeDirty.event;

  constructor(private readonly appReviewIntegration: AppReviewIntegration) {}

  isDirtyForFile(absolutePath: string): boolean {
    const mapping = this.appReviewIntegration.getReviewMapping(absolutePath);
    if (!mapping) {
      return false;
    }
    return this.dirtyByRepoRelativePath.get(mapping.relativePath) === true;
  }

  async refreshPath(absolutePath: string): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(absolutePath);
    const gitRoot = this.appReviewIntegration.getActiveGitRoot();
    if (!mapping || !gitRoot) {
      return;
    }

    try {
      const r = await runGitStdout(gitRoot, ["status", "--porcelain", "--", mapping.relativePath]);
      const dirty = r.code === 0 && r.stdout.trim().length > 0;
      this.dirtyByRepoRelativePath.set(mapping.relativePath, dirty);
      this._onDidChangeDirty.fire();
    } catch {
      // git status failed or timed out — leave existing dirty state, fire refresh anyway
      this._onDidChangeDirty.fire();
    }
  }

  async refreshAllMapped(): Promise<void> {
    for (const mapping of this.appReviewIntegration.getReviewMappings().values()) {
      await this.refreshPath(mapping.originalFilePath);
    }
  }

  invalidatePath(absolutePath: string): void {
    const mapping = this.appReviewIntegration.getReviewMapping(absolutePath);
    if (mapping) {
      this.dirtyByRepoRelativePath.delete(mapping.relativePath);
      this._onDidChangeDirty.fire();
    }
  }

  scheduleRefreshPath(absolutePath: string, delayMs = 400): void {
    const mapping = this.appReviewIntegration.getReviewMapping(absolutePath);
    if (!mapping) {
      return;
    }
    const timerKey = mapping.relativePath;
    const prev = this.debounceTimers.get(timerKey);
    if (prev) {
      clearTimeout(prev);
    }
    const t = setTimeout(() => {
      this.debounceTimers.delete(timerKey);
      void this.refreshPath(absolutePath);
    }, delayMs);
    this.debounceTimers.set(timerKey, t);
  }

  dispose(): void {
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
    this._onDidChangeDirty.dispose();
  }
}

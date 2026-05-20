import * as vscode from "vscode";
import * as path from "path";
import { spawn } from "child_process";
import type { BotReviewIntegration } from "./botReviewIntegration";
import { resolveReviewFilePath, reviewPathKey } from "./botReviewPaths";

function runGitStdout(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Tracks `git status --porcelain` per reviewed file so CodeLens can show Commit only when dirty.
 */
export class BotReviewGitStatusTracker implements vscode.Disposable {
  private readonly dirtyByNormalizedPath = new Map<string, boolean>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _onDidChangeDirty = new vscode.EventEmitter<void>();
  readonly onDidChangeDirty = this._onDidChangeDirty.event;

  constructor(private readonly botReviewIntegration: BotReviewIntegration) {}

  /** Last known value; false if never checked or known clean. */
  isDirtySync(normalizedAbsolutePath: string): boolean {
    return this.dirtyByNormalizedPath.get(reviewPathKey(normalizedAbsolutePath)) === true;
  }

  async refreshPath(normalizedAbsolutePath: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return;
    }
    const gitRoot = await this.botReviewIntegration.resolveGitRepositoryRoot(workspaceRoot);
    if (!gitRoot) {
      return;
    }
    const resolved = resolveReviewFilePath(normalizedAbsolutePath);
    const key = reviewPathKey(resolved);
    const rel = path.relative(gitRoot, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      this.dirtyByNormalizedPath.set(key, false);
      this._onDidChangeDirty.fire();
      return;
    }
    const relPosix = rel.split(path.sep).join("/");
    const r = await runGitStdout(gitRoot, ["status", "--porcelain", "--", relPosix]);
    const dirty = r.code === 0 && r.stdout.trim().length > 0;
    this.dirtyByNormalizedPath.set(key, dirty);
    this._onDidChangeDirty.fire();
  }

  async refreshAllMapped(): Promise<void> {
    for (const mapping of this.botReviewIntegration.getReviewMappings().values()) {
      await this.refreshPath(mapping.originalFilePath);
    }
  }

  invalidatePath(normalizedAbsolutePath: string): void {
    this.dirtyByNormalizedPath.delete(reviewPathKey(normalizedAbsolutePath));
    this._onDidChangeDirty.fire();
  }

  scheduleRefreshPath(normalizedAbsolutePath: string, delayMs = 400): void {
    const n = reviewPathKey(normalizedAbsolutePath);
    const prev = this.debounceTimers.get(n);
    if (prev) {
      clearTimeout(prev);
    }
    const t = setTimeout(() => {
      this.debounceTimers.delete(n);
      void this.refreshPath(n);
    }, delayMs);
    this.debounceTimers.set(n, t);
  }

  dispose(): void {
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
    this._onDidChangeDirty.dispose();
  }
}

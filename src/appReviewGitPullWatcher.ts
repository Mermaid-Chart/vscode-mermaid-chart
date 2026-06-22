import * as vscode from "vscode";
import * as path from "path";
import { watch, type FSWatcher } from "node:fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { AppReviewIntegration } from "./appReviewIntegration";

const execAsync = promisify(exec);
const GIT_EXEC_TIMEOUT_MS = 15_000;

const PULL_CHECK_DEBOUNCE_MS = 800;

/**
 * Detects git pull by watching remote-fetch signals only (not local commits).
 *
 * - `git commit`  → updates refs/heads only        → we do NOT watch that
 * - `git pull`    → updates FETCH_HEAD + origin   → we watch those, then check HEAD moved
 */
export class AppReviewGitPullWatcher implements vscode.Disposable {
  private readonly lastHeadByRepo = new Map<string, string>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly fsWatchers: FSWatcher[] = [];

  constructor(
    private readonly integration: AppReviewIntegration,
    private readonly onFilesRegistered?: (count: number) => void | Promise<void>,
  ) {}

  start(context: vscode.ExtensionContext): void {
    void this.setupFileWatchersForWorkspace();
    context.subscriptions.push(this);
  }

  private async setupFileWatchersForWorkspace(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return;
    }
    const gitRoot =
      (await this.integration.resolveGitRepositoryRoot(workspaceRoot)) ??
      path.normalize(workspaceRoot);
    const gitDir = await this.resolveGitDir(gitRoot);
    if (!gitDir) {
      return;
    }

    const repoKey = path.normalize(gitRoot);
    const headSha = await this.readHeadSha(gitRoot);
    if (headSha) {
      this.lastHeadByRepo.set(repoKey, headSha);
    }

    const schedule = () => this.schedulePullCheck(gitRoot);

    // Pull/fetch touches remote metadata — local `git commit` does not.
    try {
      this.fsWatchers.push(watch(path.join(gitDir, "FETCH_HEAD"), schedule));
    } catch {
      /* FETCH_HEAD may not exist yet */
    }
    try {
      this.fsWatchers.push(watch(path.join(gitDir, "refs", "remotes"), schedule));
    } catch {
      /* ignore */
    }
  }

  private schedulePullCheck(gitRoot: string): void {
    const repoKey = path.normalize(gitRoot);
    const prev = this.debounceTimers.get(repoKey);
    if (prev) {
      clearTimeout(prev);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(repoKey);
      void this.checkPullAndMaybeReview(gitRoot);
    }, PULL_CHECK_DEBOUNCE_MS);
    this.debounceTimers.set(repoKey, timer);
  }

  /** Remote refs changed — run review only if HEAD also moved (pull merged), not fetch-only. */
  private async checkPullAndMaybeReview(gitRoot: string): Promise<void> {
    const repoKey = path.normalize(gitRoot);
    const headSha = await this.readHeadSha(gitRoot);
    if (!headSha) {
      return;
    }
    const previous = this.lastHeadByRepo.get(repoKey);
    if (!previous || previous === headSha) {
      if (!previous) {
        this.lastHeadByRepo.set(repoKey, headSha);
      }
      return;
    }
    this.lastHeadByRepo.set(repoKey, headSha);
    const count = await this.integration.reviewAppCommits({ trigger: "git-update", fromSHA: previous });
    if (count > 0) {
      await this.onFilesRegistered?.(count);
    }
  }

  private async readHeadSha(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
      const sha = stdout.trim();
      return sha || null;
    } catch {
      return null;
    }
  }

  private async resolveGitDir(gitRoot: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --git-dir", {
        cwd: gitRoot,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
      const gitDir = stdout.trim();
      if (!gitDir) {
        return null;
      }
      return path.isAbsolute(gitDir) ? path.normalize(gitDir) : path.join(gitRoot, gitDir);
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const watcher of this.fsWatchers) {
      watcher.close();
    }
    this.fsWatchers.length = 0;
    this.lastHeadByRepo.clear();
  }
}

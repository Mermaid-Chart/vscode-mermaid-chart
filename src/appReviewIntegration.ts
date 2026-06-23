import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Octokit } from "@octokit/rest";
import analytics from "./analytics";
import {
  findMapKeyForRelativePath,
  githubApiHttpStatus,
  relativePathFromAbsolute,
  toPosixRepoPath,
} from "./appReviewPaths";

const execAsync = promisify(exec);
/** Max ms per git exec (Node kills the child on timeout). */
const GIT_EXEC_TIMEOUT_MS = 15_000;
const GIT_LOG_EXEC_TIMEOUT_MS = 60_000;

/** https://docs.github.com/en/rest/about-the-rest-api/api-versions */
const GITHUB_REST_API_VERSION = "2026-03-10";

interface GitHubPR {
  number: number;
  base: { sha: string };
  head: { sha: string };
}

interface GitHubContext {
  owner: string;
  repo: string;
  currentBranch: string;
  pr: GitHubPR | null;
}

/** Pending / completed app review for a workspace diagram file (Map key = relativePath). */
export interface ReviewFileMapping {
  /** Repo-relative posix path, e.g. document/<id>/flow.mmd */
  relativePath: string;
  originalFilePath: string;
  originalContent: string;
  appContent: string;
  status: "pending" | "accepted" | "rejected" | "modified";
}

/** How app review was started — controls notifications and auth prompts. */
export type AppReviewTrigger = "manual" | "git-update";

export interface ReviewAppCommitsOptions {
  trigger?: AppReviewTrigger;
  /** HEAD before pull — scan only commits between this and current HEAD. */
  fromSHA?: string;
}

export class AppReviewIntegration {
  private reviewMappings: Map<string, ReviewFileMapping> = new Map();
  /** Set for the current review session (same repo as last registerPendingAppReviews). */
  private activeGitRoot: string | null = null;
  private octokit: Octokit | null = null;
  private githubContext: GitHubContext | null = null;
  private readonly _onDidChangePendingReviews = new vscode.EventEmitter<void>();
  readonly onDidChangePendingReviews = this._onDidChangePendingReviews.event;

  /** GitHub Actions bot identity — keep [bot] literals; not user-facing "app" naming. */
  private readonly syncBotEmailPattern =
    /(\d+\+)?mermaid-diagram-sync-assistant\[bot\]@users\.noreply\.github\.com/;
  private readonly syncBotNamePattern = /mermaid-diagram-sync-assistant\[bot\]/;
  private readonly syncBotMessagePattern = /Automated diagram update \(PR #(\d+)\)/;

  notifyReviewMappingsChanged(): void {
    this._onDidChangePendingReviews.fire();
  }

  /** Number of diagram files registered for review (0 if none or on failure). */
  async reviewAppCommits(options: ReviewAppCommitsOptions = {}): Promise<number> {
    const trigger = options.trigger ?? "manual";
    const silent = trigger === "git-update";

    try {
      const workspaceRoot = this.getWorkspaceRoot();
      if (!workspaceRoot) {
        if (!silent) {
          vscode.window.showErrorMessage("Open a folder workspace to review app sync commits.");
        }
        return 0;
      }

      const authed = await this.ensureGitHubAuthentication(silent);
      if (!authed) {
        return 0;
      }

      this.githubContext = null;
      const gh = await this.getCurrentGitHubContext();
      if (!gh?.pr) {
        if (!silent) {
          vscode.window.showErrorMessage(
            "No open GitHub pull request found for this branch. App review needs PR base content from GitHub."
          );
        }
        return 0;
      }

      const gitRoot =
        (await this.getGitRepositoryRoot(workspaceRoot)) ?? path.normalize(workspaceRoot);
      const { stdout: headShaOut } = await execAsync("git rev-parse HEAD", {
        cwd: workspaceRoot,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
      const headSHA = headShaOut.trim();
      if (!headSHA) {
        if (!silent) {
          vscode.window.showErrorMessage("Could not read HEAD. Is this a git repository?");
        }
        return 0;
      }

      // Manual: entire PR (PR base → HEAD). Pull: only this pull (pre-pull HEAD → HEAD).
      const fromSHA = options.fromSHA ?? gh.pr.base.sha;
      const clearExisting = !options.fromSHA;

      const relPaths = await this.collectAppSyncTouchedMermaidRelPaths(gitRoot, fromSHA);
      if (relPaths.length === 0) {
        if (!silent) {
          vscode.window.showInformationMessage(
            "No .mmd/.mermaid files touched by Mermaid Sync app commits in the selected range."
          );
        }
        return 0;
      }

      await this.registerPendingAppReviews(
        workspaceRoot,
        gitRoot,
        fromSHA,
        headSHA,
        relPaths,
        silent,
        clearExisting
      );
      analytics.trackAppReviewTriggered();

      const message = `Mermaid Sync app updated ${relPaths.length} diagram file(s). See Review Mermaid Sync in the sidebar.`;
      if (silent) {
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showInformationMessage(
          `Marked ${relPaths.length} diagram file(s) for Mermaid Sync app review.`,
        );
      }
      return this.reviewMappings.size;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!silent) {
        vscode.window.showErrorMessage(`App review failed: ${msg}`);
      }
      return 0;
    }
  }

  /**
   * Load Octokit + PR base vs HEAD snapshots into memory; decorate original paths only.
   * Removes legacy review temp folders if present.
   */
  private async registerPendingAppReviews(
    workspaceRoot: string,
    gitRoot: string,
    originalSHA: string,
    headSHA: string,
    relativeMermaidPaths: string[],
    silent = false,
    clearExisting = true
  ): Promise<void> {
    const context = this.githubContext;
    if (!context || !this.octokit) {
      throw new Error("GitHub context missing");
    }

    for (const legacyName of [".mermaid-bot-review-temp", ".mermaid-app-review-temp"]) {
      const legacyFolder = path.join(workspaceRoot, legacyName);
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(legacyFolder), { recursive: true });
      } catch {
        /* not present */
      }
    }

    this.activeGitRoot = path.normalize(gitRoot);

    if (clearExisting) {
      this.reviewMappings.clear();
    }

    for (const rel of relativeMermaidPaths) {
      const relPosix = toPosixRepoPath(rel);
      const mapKey = relPosix;
      let originalContent: string;
      try {
        originalContent = await this.fetchFileContentApi(
          context.owner,
          context.repo,
          relPosix,
          originalSHA
        );
      } catch (e) {
        if (githubApiHttpStatus(e) === 404) {
          // New diagram on this PR — no file at PR base ref.
          originalContent = "";
        } else {
          this.warnSkipFile(relPosix, "PR base", e, silent);
          continue;
        }
      }

      let appContent: string;
      try {
        appContent = await this.fetchFileContentApi(
          context.owner,
          context.repo,
          relPosix,
          headSHA
        );
      } catch (e) {
        this.warnSkipFile(relPosix, "HEAD", e, silent);
        continue;
      }

      const originalFilePath = path.normalize(
        path.join(gitRoot, ...relPosix.split("/"))
      );
      this.reviewMappings.set(mapKey, {
        relativePath: relPosix,
        originalFilePath,
        originalContent,
        appContent,
        status: "pending",
      });
    }

    if (this.reviewMappings.size === 0) {
      this.activeGitRoot = null;
    }

    this.notifyReviewMappingsChanged();
  }

  /** Git root for the current review session (null when no files are in review). */
  getActiveGitRoot(): string | null {
    return this.activeGitRoot;
  }

  /** Repo-relative Map key for an absolute path; null if outside active git root or no session. */
  lookupRepoRelativeKey(absolutePath: string): string | null {
    if (!this.activeGitRoot) {
      return null;
    }
    const rel = relativePathFromAbsolute(this.activeGitRoot, absolutePath);
    if (!rel) {
      return null;
    }
    return findMapKeyForRelativePath(this.reviewMappings.keys(), rel);
  }

  private warnSkipFile(
    relPosix: string,
    refLabel: string,
    error: unknown,
    silent: boolean
  ): void {
    if (silent) {
      return;
    }
    const status = githubApiHttpStatus(error);
    const detail = status !== undefined ? ` (HTTP ${status})` : "";
    vscode.window.showWarningMessage(
      `Skipping ${relPosix}: could not load file at ${refLabel} from GitHub${detail}.`
    );
  }

  /** All repo-relative .mmd/.mermaid paths touched in sync-app commits between `baseSHA` (exclusive) and `HEAD` (inclusive). */
  private async collectAppSyncTouchedMermaidRelPaths(cwd: string, baseSHA: string): Promise<string[]> {
    const relSet = new Set<string>();
    try {
      const { stdout: logOut } = await execAsync(`git log ${baseSHA}..HEAD --pretty=format:%H`, {
        cwd,
        timeout: GIT_LOG_EXEC_TIMEOUT_MS,
      });
      const hashes = logOut
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const hash of hashes) {
        const { stdout: metaOut } = await execAsync(`git show -s --format=%ae%n%an%n%s ${hash}`, {
          cwd,
          timeout: GIT_EXEC_TIMEOUT_MS,
        });
        const lines = metaOut.trim().split("\n");
        const authorEmail = lines[0] ?? "";
        const authorName = lines[1] ?? "";
        const message = lines.slice(2).join("\n");
        if (!this.isSyncAppBotCommit({ authorEmail, authorName, message })) {
          continue;
        }
        const { stdout: namesOut } = await execAsync(
          `git diff-tree --no-commit-id --name-only -r ${hash}`,
          { cwd, timeout: GIT_EXEC_TIMEOUT_MS }
        );
        for (const p of namesOut
          .trim()
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)) {
          if (p.endsWith(".mmd") || p.endsWith(".mermaid")) {
            relSet.add(p.replace(/\\/g, "/"));
          }
        }
      }
    } catch (e) {
      // swallow — returns empty set
    }
    return [...relSet];
  }

  /** Public: git repo root for workspace folder (normalized). */
  async resolveGitRepositoryRoot(workspaceRoot: string): Promise<string | null> {
    return this.getGitRepositoryRoot(workspaceRoot);
  }

  /** Remove a single file from active app review (Submit, or after push). */
  removeReviewForFile(absoluteFilePath: string): boolean {
    const key = this.lookupRepoRelativeKey(absoluteFilePath);
    if (!key) {
      return false;
    }
    if (this.reviewMappings.delete(key)) {
      if (this.reviewMappings.size === 0) {
        this.activeGitRoot = null;
      }
      this.notifyReviewMappingsChanged();
      return true;
    }
    return false;
  }

  /** End the review session and clear every mapped diagram (does not revert file content). */
  clearAllReviews(): number {
    const count = this.reviewMappings.size;
    if (count === 0) {
      return 0;
    }
    this.reviewMappings.clear();
    this.activeGitRoot = null;
    this.notifyReviewMappingsChanged();
    return count;
  }

  private isSyncAppBotCommit(info: {
    authorName: string;
    authorEmail: string;
    message: string;
  }): boolean {
    return (
      this.syncBotEmailPattern.test(info.authorEmail) &&
      this.syncBotNamePattern.test(info.authorName) &&
      this.syncBotMessagePattern.test(info.message)
    );
  }

  async connectGitHub(): Promise<void> {
    try {
      const authed = await this.ensureGitHubAuthentication(false);
      if (!authed) {
        throw new Error("GitHub sign-in was cancelled.");
      }
      vscode.window.showInformationMessage("Connected to GitHub successfully.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`GitHub connection failed: ${msg}`);
    }
  }

  async disconnectGitHub(): Promise<void> {
    this.octokit = null;
    this.githubContext = null;
    try {
      await vscode.authentication.getSession("github", ["repo"], {
        createIfNone: false,
        clearSessionPreference: true,
      });
    } catch {
      /* ignore — preference may not be set */
    }
    vscode.window.showInformationMessage(
      "Disconnected from GitHub. Run \"MermaidChart: Connect GitHub\" to reconnect."
    );
  }

  private async ensureGitHubAuthentication(silent = false): Promise<boolean> {
    const session = await vscode.authentication.getSession("github", ["repo"], {
      createIfNone: !silent,
    });
    if (!session) {
      return false;
    }
    this.octokit = new Octokit({
      auth: session.accessToken,
      headers: { "X-GitHub-Api-Version": GITHUB_REST_API_VERSION },
    });
    return true;
  }

  private async getCurrentGitHubContext(): Promise<GitHubContext | null> {
    if (this.githubContext) {
      return this.githubContext;
    }
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot || !this.octokit) {
      return null;
    }
    const { stdout: remoteUrl } = await execAsync("git config --get remote.origin.url", {
      cwd: workspaceRoot,
      timeout: GIT_EXEC_TIMEOUT_MS,
    });
    const { owner, repo } = this.parseGitHubUrl(remoteUrl.trim());
    const { stdout: currentBranch } = await execAsync("git branch --show-current", {
      cwd: workspaceRoot,
      timeout: GIT_EXEC_TIMEOUT_MS,
    });
    const branch = currentBranch.trim();
    const pr = await this.findPRForCurrentBranch(owner, repo, branch);
    this.githubContext = { owner, repo, currentBranch: branch, pr };
    return this.githubContext;
  }

  private parseGitHubUrl(remoteUrl: string): { owner: string; repo: string } {
    let match: RegExpMatchArray | null = null;
    if (remoteUrl.startsWith("git@github.com:")) {
      match = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    } else if (remoteUrl.startsWith("https://github.com/")) {
      match = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    }
    if (!match) {
      throw new Error(`Not a github.com remote: ${remoteUrl}`);
    }
    return { owner: match[1], repo: match[2] };
  }

  private async findPRForCurrentBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<GitHubPR | null> {
    if (!this.octokit) {
      return null;
    }
    try {
      const { data: pulls } = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        head: `${owner}:${branch}`,
      });
      if (pulls.length > 0) {
        return pulls[0] as GitHubPR;
      }
      const { data: pullsAlt } = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        head: branch,
      });
      if (pullsAlt.length > 0) {
        return pullsAlt[0] as GitHubPR;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  private async fetchFileContentApi(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string> {
    if (!this.octokit) {
      throw new Error("Octokit not ready");
    }
    const { data } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref,
    });
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
    throw new Error("Not a file or empty");
  }

  /**
   * Re-fetch app sync proposal from GitHub at local HEAD and refresh mapping.appContent.
   * Used when restoring the bot proposal after user edits.
   */
  async fetchAppContentAtHead(absoluteFilePath: string): Promise<string | null> {
    const mapping = this.getReviewMapping(absoluteFilePath);
    if (!mapping) {
      return null;
    }

    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      return null;
    }

    const authed = await this.ensureGitHubAuthentication(false);
    if (!authed) {
      return null;
    }

    const gh = await this.getCurrentGitHubContext();
    if (!gh) {
      return null;
    }

    try {
      const { stdout: headShaOut } = await execAsync("git rev-parse HEAD", {
        cwd: workspaceRoot,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
      const headSHA = headShaOut.trim();
      if (!headSHA) {
        return null;
      }

      const content = await this.fetchFileContentApi(
        gh.owner,
        gh.repo,
        mapping.relativePath,
        headSHA
      );
      mapping.appContent = content;
      return content;
    } catch {
      return null;
    }
  }

  /** Lookup by absolute path to the real diagram file. */
  getReviewMapping(absoluteFilePath: string): ReviewFileMapping | undefined {
    const key = this.lookupRepoRelativeKey(absoluteFilePath);
    if (!key) {
      return undefined;
    }
    return this.reviewMappings.get(key);
  }

  private async getGitRepositoryRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --show-toplevel", {
        cwd,
        timeout: GIT_EXEC_TIMEOUT_MS,
      });
      const root = stdout.trim();
      return root ? path.normalize(root) : null;
    } catch {
      return null;
    }
  }

  getReviewMappings(): Map<string, ReviewFileMapping> {
    return this.reviewMappings;
  }

  dispose(): void {
    this.reviewMappings.clear();
    this.activeGitRoot = null;
    this._onDidChangePendingReviews.dispose();
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }
}

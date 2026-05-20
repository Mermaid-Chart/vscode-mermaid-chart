import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Octokit } from "@octokit/rest";
import {
  GITHUB_REST_API_VERSION,
  resolveReviewFilePath,
  reviewPathKey,
} from "./botReviewPaths";

const execAsync = promisify(exec);

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

/** Pending / completed bot review for a workspace diagram file (key = normalized originalFilePath). */
export interface ReviewFileMapping {
  originalFilePath: string;
  originalContent: string;
  botContent: string;
  status: "pending" | "accepted" | "rejected" | "modified";
}

/** How bot review was started — controls notifications and auth prompts. */
export type BotReviewTrigger = "manual" | "git-update";

export interface ReviewBotCommitsOptions {
  trigger?: BotReviewTrigger;
  /** HEAD before pull — scan only commits between this and current HEAD. */
  fromSHA?: string;
}

export class BotReviewIntegration {
  private reviewMappings: Map<string, ReviewFileMapping> = new Map();
  private octokit: Octokit | null = null;
  private githubContext: GitHubContext | null = null;
  private readonly _onDidChangePendingReviews = new vscode.EventEmitter<void>();
  readonly onDidChangePendingReviews = this._onDidChangePendingReviews.event;

  private readonly botEmailPattern = /(\d+\+)?mermaid-diagram-sync-assistant\[bot\]@users\.noreply\.github\.com/;
  private readonly botNamePattern = /mermaid-diagram-sync-assistant\[bot\]/;
  private readonly botMessagePattern = /Automated diagram update \(PR #(\d+)\)/;

  notifyReviewMappingsChanged(): void {
    this._onDidChangePendingReviews.fire();
  }

  async reviewBotCommits(options: ReviewBotCommitsOptions = {}): Promise<void> {
    const trigger = options.trigger ?? "manual";
    const silent = trigger === "git-update";

    try {
      const workspaceRoot = this.getWorkspaceRoot();
      if (!workspaceRoot) {
        if (!silent) {
          vscode.window.showErrorMessage("Open a folder workspace to review bot commits.");
        }
        return;
      }

      const authed = await this.ensureGitHubAuthentication(silent);
      if (!authed) {
        return;
      }

      this.githubContext = null;
      const gh = await this.getCurrentGitHubContext();
      if (!gh?.pr) {
        if (!silent) {
          vscode.window.showErrorMessage(
            "No open GitHub pull request found for this branch. Bot review needs PR base content from GitHub."
          );
        }
        return;
      }

      const gitRoot =
        (await this.getGitRepositoryRoot(workspaceRoot)) ?? resolveReviewFilePath(workspaceRoot);
      const { stdout: headShaOut } = await execAsync("git rev-parse HEAD", { cwd: workspaceRoot });
      const headSHA = headShaOut.trim();
      if (!headSHA) {
        if (!silent) {
          vscode.window.showErrorMessage("Could not read HEAD. Is this a git repository?");
        }
        return;
      }

      // Manual: entire PR (PR base → HEAD). Pull: only this pull (pre-pull HEAD → HEAD).
      const fromSHA = options.fromSHA ?? gh.pr.base.sha;
      const clearExisting = !options.fromSHA;

      const relPaths = await this.collectBotTouchedMermaidRelPaths(gitRoot, fromSHA);
      if (relPaths.length === 0) {
        if (!silent) {
          vscode.window.showInformationMessage(
            "No .mmd/.mermaid files touched by Mermaid Diagram Sync bot commits in the selected range."
          );
        }
        return;
      }

      await this.registerPendingBotReviews(
        workspaceRoot,
        gitRoot,
        fromSHA,
        headSHA,
        relPaths,
        silent,
        clearExisting
      );

      const message = `Mermaid Diagram Sync updated ${relPaths.length} diagram file(s). Open each file to Review / Accept / Reject from CodeLens.`;
      if (silent) {
        vscode.window.showInformationMessage(message);
      } else {
        vscode.window.showInformationMessage(
          `Marked ${relPaths.length} diagram file(s) for bot review. Open each file for Review / Accept / Reject / Submit.`
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!silent) {
        vscode.window.showErrorMessage(`Bot review failed: ${msg}`);
      }
    }
  }

  /**
   * Load Octokit + PR base vs HEAD snapshots into memory; decorate original paths only.
   * Removes legacy `.mermaid-bot-review-temp` folder if present.
   */
  private async registerPendingBotReviews(
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

    const legacyFolder = path.join(workspaceRoot, ".mermaid-bot-review-temp");
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(legacyFolder), { recursive: true });
    } catch {
      /* not present */
    }

    if (clearExisting) {
      this.reviewMappings.clear();
    }

    for (const rel of relativeMermaidPaths) {
      const relPosix = rel.split(path.sep).join("/");
      let originalContent = "";
      let botContent = "";
      try {
        originalContent = await this.fetchFileContentApi(
          context.owner,
          context.repo,
          relPosix,
          originalSHA
        );
      } catch {
        originalContent = "";
      }
      try {
        botContent = await this.fetchFileContentApi(
          context.owner,
          context.repo,
          relPosix,
          headSHA
        );
      } catch (e) {
        if (!silent) {
          vscode.window.showWarningMessage(
            `Skipping ${relPosix}: could not load file at HEAD from GitHub.`
          );
        }
        continue;
      }

      const originalFilePath = resolveReviewFilePath(path.join(gitRoot, relPosix));
      this.reviewMappings.set(reviewPathKey(originalFilePath), {
        originalFilePath,
        originalContent,
        botContent,
        status: "pending",
      });
    }

    this.notifyReviewMappingsChanged();
  }

  /** All repo-relative .mmd/.mermaid paths touched in bot commits between `baseSHA` (exclusive) and `HEAD` (inclusive). */
  private async collectBotTouchedMermaidRelPaths(cwd: string, baseSHA: string): Promise<string[]> {
    const relSet = new Set<string>();
    try {
      const { stdout: logOut } = await execAsync(`git log ${baseSHA}..HEAD --pretty=format:%H`, {
        cwd,
      });
      const hashes = logOut
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const hash of hashes) {
        const { stdout: metaOut } = await execAsync(`git show -s --format=%ae%n%an%n%s ${hash}`, {
          cwd,
        });
        const lines = metaOut.trim().split("\n");
        const authorEmail = lines[0] ?? "";
        const authorName = lines[1] ?? "";
        const message = lines.slice(2).join("\n");
        if (!this.isBotCommit({ authorEmail, authorName, message })) {
          continue;
        }
        const { stdout: namesOut } = await execAsync(
          `git diff-tree --no-commit-id --name-only -r ${hash}`,
          { cwd }
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

  /** Remove a single file from active bot review (Submit, or after push). */
  removeReviewForFile(absoluteFilePath: string): boolean {
    const key = reviewPathKey(absoluteFilePath);
    if (this.reviewMappings.delete(key)) {
      this.notifyReviewMappingsChanged();
      return true;
    }
    return false;
  }

  private isBotCommit(info: {
    authorName: string;
    authorEmail: string;
    message: string;
  }): boolean {
    return (
      this.botEmailPattern.test(info.authorEmail) &&
      this.botNamePattern.test(info.authorName) &&
      this.botMessagePattern.test(info.message)
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
    });
    const { owner, repo } = this.parseGitHubUrl(remoteUrl.trim());
    const { stdout: currentBranch } = await execAsync("git branch --show-current", {
      cwd: workspaceRoot,
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

  /** Lookup by absolute path to the real diagram file (normalized). */
  getReviewMapping(originalFilePath: string): ReviewFileMapping | undefined {
    return this.reviewMappings.get(reviewPathKey(originalFilePath));
  }

  private async getGitRepositoryRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd });
      const root = stdout.trim();
      return root ? resolveReviewFilePath(root) : null;
    } catch (e) {
      return null;
    }
  }

  getReviewMappings(): Map<string, ReviewFileMapping> {
    return this.reviewMappings;
  }

  dispose(): void {
    this.reviewMappings.clear();
    this._onDidChangePendingReviews.dispose();
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }
}

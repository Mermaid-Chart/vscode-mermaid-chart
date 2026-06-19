import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { API as GitAPI, GitExtension, Repository, Commit } from "../../types/git";
import { BotEditDetector, BotEditInfo } from "./botEditDetector";

const CONFIG_SECTION = "mermaidChart.prReview";
const DEFAULT_TRAILER = "Mermaid-Sync: regenerated";

interface CacheEntry {
    sha: string;
    info: BotEditInfo | null;
}

/**
 * {@link BotEditDetector} backed by the VS Code built-in Git extension.
 *
 * Reads the most recent commit touching `uri`, looks for the configured
 * trailer (default `Mermaid-Sync: regenerated`), and returns
 * {@link BotEditInfo}. Caches per `uri+sha` so repeated banner / decoration
 * queries don't re-hit `git log`.
 *
 * Degrades gracefully — returns `null` whenever git is unavailable, the file
 * is untracked, the trailer is absent, or the user disabled PR-review
 * detection via `mermaidChart.prReview.enabled`.
 */
export class GitTrailerDetector implements BotEditDetector, vscode.Disposable {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly emitter = new vscode.EventEmitter<vscode.Uri | undefined>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly watchedRepos = new WeakSet<Repository>();

    readonly onDidChange = this.emitter.event;

    constructor() {
        this.disposables.push(this.emitter);

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (
                    e.affectsConfiguration(`${CONFIG_SECTION}.enabled`) ||
                    e.affectsConfiguration(`${CONFIG_SECTION}.commitTrailer`)
                ) {
                    this.cache.clear();
                    this.emitter.fire(undefined);
                }
            }),
        );

        const gitApi = this.getGitApi();
        if (gitApi) {
            this.watchExistingRepos(gitApi);
            this.disposables.push(
                gitApi.onDidOpenRepository((repo) => {
                    this.watchRepo(repo);
                    // A repo just became known to VS Code (e.g. a loose file
                    // opened from outside the workspace triggered auto-detection).
                    // Drop cached null results so providers re-query.
                    this.cache.clear();
                    this.emitter.fire(undefined);
                }),
            );
        }
    }

    dispose(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* best-effort */ }
        }
        this.cache.clear();
    }

    async detect(uri: vscode.Uri): Promise<BotEditInfo | null> {
        console.log("[BotEditDetector] detect() called for", uri.fsPath);

        if (!this.isEnabled()) {
            console.log("[BotEditDetector] disabled by config");
            return null;
        }

        const gitApi = this.getGitApi();
        if (!gitApi) {
            console.log("[BotEditDetector] git API unavailable");
            return null;
        }

        let repo = gitApi.getRepository(uri);
        if (!repo) {
            console.log("[BotEditDetector] getRepository returned null, trying loose-file fallback");
            const root = findRepoRoot(uri.fsPath);
            console.log("[BotEditDetector] findRepoRoot →", root);
            if (!root) {
                return null;
            }
            try {
                repo = (await gitApi.openRepository(vscode.Uri.file(root))) ?? null;
                console.log("[BotEditDetector] openRepository →", repo ? "got repo" : "null");
            } catch (err) {
                console.warn("[BotEditDetector] openRepository failed:", err);
                return null;
            }
            if (!repo) {
                return null;
            }
            this.watchRepo(repo);
        } else {
            console.log("[BotEditDetector] getRepository returned repo at", repo.rootUri.fsPath);
        }

        let commit: Commit | undefined;
        try {
            const log = await repo.log({ path: uri.fsPath, maxEntries: 1 });
            console.log("[BotEditDetector] git log returned", log?.length ?? 0, "commits");
            commit = log?.[0];
            if (commit) {
                console.log("[BotEditDetector] latest commit:", commit.hash.slice(0, 7), "by", commit.authorName);
                console.log("[BotEditDetector] commit message:\n" + commit.message);
            }
        } catch (err) {
            console.warn("[BotEditDetector] git log failed:", err);
            return null;
        }

        if (!commit) {
            return null;
        }

        const cacheKey = uri.toString();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.sha === commit.hash) {
            console.log("[BotEditDetector] cache hit:", cached.info ? "match" : "no match");
            return cached.info;
        }

        const trailerSpec = this.getTrailerPattern();
        console.log("[BotEditDetector] parsing with trailer:", trailerSpec);
        const info = parseBotEditInfo(commit, trailerSpec);
        console.log("[BotEditDetector] parseBotEditInfo →", info ? "MATCH" : "no match");
        this.cache.set(cacheKey, { sha: commit.hash, info });
        return info;
    }

    /**
     * Test seam: clear the per-uri cache. Production code relies on
     * git-state and config events to invalidate.
     */
    invalidate(uri?: vscode.Uri): void {
        if (uri) {
            this.cache.delete(uri.toString());
        } else {
            this.cache.clear();
        }
        this.emitter.fire(uri);
    }

    private isEnabled(): boolean {
        return vscode.workspace
            .getConfiguration()
            .get<boolean>(`${CONFIG_SECTION}.enabled`, true);
    }

    private getTrailerPattern(): string {
        return vscode.workspace
            .getConfiguration()
            .get<string>(`${CONFIG_SECTION}.commitTrailer`, DEFAULT_TRAILER);
    }

    private getGitApi(): GitAPI | undefined {
        const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
        if (!ext) {
            return undefined;
        }
        const exports = ext.isActive ? ext.exports : undefined;
        if (!exports || !exports.enabled) {
            return undefined;
        }
        try {
            return exports.getAPI(1);
        } catch (err) {
            console.warn("[BotEditDetector] git getAPI(1) failed:", err);
            return undefined;
        }
    }

    private watchExistingRepos(api: GitAPI): void {
        for (const repo of api.repositories) {
            this.watchRepo(repo);
        }
    }

    private watchRepo(repo: Repository): void {
        if (this.watchedRepos.has(repo)) {
            return;
        }
        this.watchedRepos.add(repo);
        this.disposables.push(
            repo.state.onDidChange(() => {
                this.cache.clear();
                this.emitter.fire(undefined);
            }),
        );
    }
}

/**
 * Pure parsing function — public for unit testing without spinning up the
 * VS Code git extension.
 *
 * `trailerSpec` follows the human-friendly form `Key: value` (e.g.
 * `Mermaid-Sync: regenerated`). Matching is case-sensitive on the key,
 * case-insensitive on the value, and anchored to the start of a line so a
 * literal mention inside diagram source doesn't false-trigger.
 */
export function parseBotEditInfo(
    commit: Commit,
    trailerSpec: string,
): BotEditInfo | null {
    const trailerKey = trailerSpec.split(":")[0]?.trim();
    const trailerValue = trailerSpec.split(":").slice(1).join(":").trim();
    if (!trailerKey || !trailerValue) {
        return null;
    }

    const escapedKey = escapeRegex(trailerKey);
    const escapedValue = escapeRegex(trailerValue);
    const trailerRegex = new RegExp(
        `^${escapedKey}:\\s*${escapedValue}\\b`,
        "im",
    );
    if (!trailerRegex.test(commit.message)) {
        return null;
    }

    const matchTrailer = (key: string): string | undefined => {
        const re = new RegExp(`^${escapeRegex(key)}:\\s*(.+)$`, "im");
        return commit.message.match(re)?.[1]?.trim();
    };

    return {
        commitSha: commit.hash,
        shortSha: commit.hash.slice(0, 7),
        parentSha: commit.parents[0],
        commitMessage: commit.message,
        authorName: commit.authorName ?? "unknown",
        authoredAt: commit.authorDate ?? new Date(0),
        sourceRef: matchTrailer("Mermaid-Sync-Source"),
        prRef: matchTrailer("Mermaid-Sync-PR"),
        prTitle: matchTrailer("Mermaid-Sync-PR-Title"),
        reason: matchTrailer("Mermaid-Sync-Reason"),
    };
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walk up from `filePath` looking for a `.git` entry (directory or file —
 * worktrees use a `.git` file). Returns the absolute path of the directory
 * containing it, or `null` when no repo is found before reaching the
 * filesystem root. Synchronous because the existence check is cheap and the
 * walk depth is bounded by the path length.
 */
function findRepoRoot(filePath: string): string | null {
    let current = path.dirname(filePath);
    const root = path.parse(current).root;
    while (true) {
        try {
            if (fs.existsSync(path.join(current, ".git"))) {
                return current;
            }
        } catch { /* continue walking */ }
        if (current === root) {
            return null;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import analytics from "../../analytics";
import { extractMetadataFromCode } from "../../frontmatter";
import { getTriggerScope } from "../config/syncConfigService";
import { OPEN_SYNC_CONFIG_COMMAND } from "../config/syncConfigPanel";

/**
 * Step 3 — the create-on-commit nudge (the inverse of pre-commit sync).
 *
 * Manual "Generate Diagram from Code" is the most-used feature; the automatic
 * push is barely touched. So this is built as a QUIET, DISMISSIBLE PULL: after a
 * commit touches structural code in an opted-in path (per the Slice 6 trigger
 * scope) that has no associated diagram, we *offer* to visualize it. We never
 * auto-create, never block a commit.
 *
 * Two dismissible surfaces, both optional:
 *   - a CodeLens on the changed file ("Visualize these changes as a diagram"),
 *   - a soft notification with a link to the config ("what triggers this?").
 *
 * Accept reuses the existing chat-based Generate-from-Code engine, which presents
 * its result as a reviewable draft and never writes the `.mmd` itself.
 *
 * Detection deliberately reuses the pre-commit `.git` watch approach, but keys on
 * HEAD movement (a new commit) rather than the index.
 */

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5000;

const ENABLE_SETTING = "createOnCommit.enabled";
export const GENERATE_COMMAND = "mermaidChart.createOnCommit.generate";
export const DISMISS_COMMAND = "mermaidChart.createOnCommit.dismiss";
/** workspaceState: map of workspace-relative path → commit sha it was dismissed for. */
const DISMISS_STATE_KEY = "mermaidChart.createOnCommit.dismissed";

/** A file whose latest commit added code with no linked diagram yet. */
interface Candidate {
  uri: vscode.Uri;
  relativePath: string;
  /** The commit that surfaced this candidate (dismissals are keyed per commit). */
  sha: string;
}

async function runGit(
  args: string[],
  cwd: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Resolve a `.mmd` reference string ("File: /src/auth.ts") to an absolute path.
 * Mirrors the workspace-relative convention used by the pre-commit service.
 */
function resolveReferencePath(reference: string, workspacePath: string): string | undefined {
  const match = reference.match(/File: (.*?)(\s|$|\()/);
  if (!match) {
    return undefined;
  }
  const filePath = match[1].trim();
  if (!filePath.includes("/") && !filePath.includes("\\")) {
    return undefined;
  }
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    return path.normalize(filePath);
  }
  const relative = filePath.replace(/^[/\\]+/, "");
  return path.normalize(path.join(workspacePath, relative));
}

/**
 * Provides the per-file CodeLens nudge. Holds the current candidate set; lenses
 * appear only on files in it, and clear on accept/dismiss.
 */
class CreateOnCommitCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  /** fsPath → sha of the active candidates. */
  private candidates = new Map<string, string>();

  setCandidates(candidates: Candidate[]): void {
    this.candidates = new Map(candidates.map((c) => [c.uri.fsPath, c.sha]));
    this.emitter.fire();
  }

  remove(fsPath: string): void {
    if (this.candidates.delete(fsPath)) {
      this.emitter.fire();
    }
  }

  has(fsPath: string): boolean {
    return this.candidates.has(fsPath);
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const sha = this.candidates.get(document.uri.fsPath);
    if (!sha) {
      return [];
    }
    const top = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(top, {
        title: "▷ Visualize these changes as a diagram",
        command: GENERATE_COMMAND,
        arguments: [document.uri],
      }),
      new vscode.CodeLens(top, {
        title: "Dismiss",
        command: DISMISS_COMMAND,
        arguments: [document.uri, sha],
      }),
    ];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

export class CreateOnCommitService {
  private static watchers = new Map<string, fs.FSWatcher>();
  private static debounceTimers = new Map<string, NodeJS.Timeout>();
  private static retryIntervals = new Map<string, NodeJS.Timeout>();
  /** Last HEAD sha seen per repo, so we only act when a commit actually lands. */
  private static lastSha = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly codeLens: CreateOnCommitCodeLensProvider,
  ) {}

  private enabled(): boolean {
    return vscode.workspace
      .getConfiguration("mermaidChart")
      .get<boolean>(ENABLE_SETTING, true);
  }

  /** Watch each workspace folder's `.git` for HEAD movement. */
  start(): void {
    const setup = (folder: vscode.WorkspaceFolder) => this.setupWatcher(folder);
    (vscode.workspace.workspaceFolders ?? []).forEach(setup);
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        e.added.forEach(setup);
        e.removed.forEach((f) => this.teardownWatcher(f));
      }),
    );
  }

  private setupWatcher(folder: vscode.WorkspaceFolder): void {
    const folderPath = folder.uri.fsPath;
    const gitDir = path.join(folderPath, ".git");

    if (!fs.existsSync(gitDir)) {
      const retry = setInterval(() => {
        if (fs.existsSync(gitDir) && !CreateOnCommitService.watchers.has(folderPath)) {
          clearInterval(retry);
          CreateOnCommitService.retryIntervals.delete(folderPath);
          this.setupWatcher(folder);
        }
      }, 5000);
      CreateOnCommitService.retryIntervals.set(folderPath, retry);
      this.context.subscriptions.push({
        dispose: () => {
          const r = CreateOnCommitService.retryIntervals.get(folderPath);
          if (r) {
            clearInterval(r);
            CreateOnCommitService.retryIntervals.delete(folderPath);
          }
        },
      });
      return;
    }

    // Seed the baseline sha so opening a repo never nudges for the existing HEAD.
    void this.readHeadSha(folderPath).then((sha) => {
      if (sha) {
        CreateOnCommitService.lastSha.set(folderPath, sha);
      }
    });

    // A commit appends to .git/logs/HEAD and rewrites the branch ref; watching
    // the .git directory and re-checking HEAD on any event is the simplest
    // reliable signal. We de-dupe via the lastSha comparison.
    const watcher = fs.watch(gitDir, () => this.onGitActivity(folderPath));
    CreateOnCommitService.watchers.set(folderPath, watcher);
    this.context.subscriptions.push({
      dispose: () => this.teardownWatcher(folder),
    });
  }

  private teardownWatcher(folder: vscode.WorkspaceFolder): void {
    const folderPath = folder.uri.fsPath;
    CreateOnCommitService.watchers.get(folderPath)?.close();
    CreateOnCommitService.watchers.delete(folderPath);
    const timer = CreateOnCommitService.debounceTimers.get(folderPath);
    if (timer) {
      clearTimeout(timer);
      CreateOnCommitService.debounceTimers.delete(folderPath);
    }
    const retry = CreateOnCommitService.retryIntervals.get(folderPath);
    if (retry) {
      clearInterval(retry);
      CreateOnCommitService.retryIntervals.delete(folderPath);
    }
  }

  private onGitActivity(folderPath: string): void {
    const existing = CreateOnCommitService.debounceTimers.get(folderPath);
    if (existing) {
      clearTimeout(existing);
    }
    CreateOnCommitService.debounceTimers.set(
      folderPath,
      setTimeout(() => void this.checkForNewCommit(folderPath), 500),
    );
  }

  private async readHeadSha(folderPath: string): Promise<string | undefined> {
    const out = await runGit(["rev-parse", "HEAD"], folderPath);
    return out?.trim() || undefined;
  }

  private async checkForNewCommit(folderPath: string): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    const sha = await this.readHeadSha(folderPath);
    if (!sha) {
      return;
    }
    if (CreateOnCommitService.lastSha.get(folderPath) === sha) {
      return; // HEAD didn't move (index-only or unrelated .git churn).
    }
    CreateOnCommitService.lastSha.set(folderPath, sha);

    const folder = vscode.workspace.workspaceFolders?.find(
      (f) => f.uri.fsPath === folderPath,
    );
    if (!folder) {
      return;
    }

    const candidates = await this.findCandidates(folder, sha);
    if (candidates.length === 0) {
      return;
    }
    this.codeLens.setCandidates(candidates);
    analytics.sendEvent("Create On Commit Nudge Shown", "VS_CODE_PLUGIN_CREATE_ON_COMMIT_SHOWN");
    await this.showNotification(candidates);
  }

  /**
   * Candidates = files changed in `sha` that match the trigger scope, look like
   * code, aren't already linked to a diagram, and weren't dismissed for this sha.
   */
  private async findCandidates(
    folder: vscode.WorkspaceFolder,
    sha: string,
  ): Promise<Candidate[]> {
    const triggerScope = await getTriggerScope();
    if (triggerScope.include.length === 0) {
      return []; // Quiet until the user configures a trigger scope (Slice 6).
    }

    const repoRoot = folder.uri.fsPath;
    const changedOut = await runGit(
      ["diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=ACMR", sha],
      repoRoot,
    );
    if (!changedOut) {
      return [];
    }
    const changedRel = changedOut
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((rel) => !rel.endsWith(".mmd") && !rel.endsWith(".mermaid"));
    if (changedRel.length === 0) {
      return [];
    }

    const inScope = await this.filterToTriggerScope(folder, changedRel, triggerScope);
    if (inScope.length === 0) {
      return [];
    }

    const referenced = await this.collectReferencedSourcePaths(folder);
    const dismissed = this.getDismissed();

    const candidates: Candidate[] = [];
    for (const rel of inScope) {
      const uri = vscode.Uri.joinPath(folder.uri, rel);
      if (referenced.has(path.normalize(uri.fsPath))) {
        continue; // Already has a linked diagram.
      }
      if (dismissed[rel] === sha) {
        continue; // Dismissed for this exact commit.
      }
      candidates.push({ uri, relativePath: rel, sha });
    }
    return candidates;
  }

  /** Use VS Code's own glob matcher (via findFiles) to honour the scope globs. */
  private async filterToTriggerScope(
    folder: vscode.WorkspaceFolder,
    changedRel: string[],
    scope: { include: string[]; exclude: string[] },
  ): Promise<string[]> {
    const includeGlob = new vscode.RelativePattern(folder, `{${scope.include.join(",")}}`);
    const excludeGlob =
      scope.exclude.length > 0
        ? new vscode.RelativePattern(folder, `{${scope.exclude.join(",")}}`)
        : null;
    const matched = await vscode.workspace.findFiles(includeGlob, excludeGlob);
    const matchedSet = new Set(matched.map((u) => path.normalize(u.fsPath)));
    return changedRel.filter((rel) =>
      matchedSet.has(path.normalize(vscode.Uri.joinPath(folder.uri, rel).fsPath)),
    );
  }

  /** Every source path referenced by any `.mmd` in the workspace (absolute, normalized). */
  private async collectReferencedSourcePaths(
    folder: vscode.WorkspaceFolder,
  ): Promise<Set<string>> {
    const referenced = new Set<string>();
    const mmdUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/*.{mmd,mermaid}"),
    );
    for (const mmdUri of mmdUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(mmdUri);
        const metadata = extractMetadataFromCode(Buffer.from(bytes).toString("utf-8"));
        for (const ref of metadata.references ?? []) {
          const resolved = resolveReferencePath(ref, folder.uri.fsPath);
          if (resolved) {
            referenced.add(path.normalize(resolved));
          }
        }
      } catch {
        // Unreadable diagram — ignore.
      }
    }
    return referenced;
  }

  private getDismissed(): Record<string, string> {
    return this.context.workspaceState.get<Record<string, string>>(DISMISS_STATE_KEY, {});
  }

  private async setDismissed(rel: string, sha: string): Promise<void> {
    const map = this.getDismissed();
    map[rel] = sha;
    await this.context.workspaceState.update(DISMISS_STATE_KEY, map);
  }

  private async showNotification(candidates: Candidate[]): Promise<void> {
    const first = candidates[0];
    const message =
      candidates.length === 1
        ? `New code in ${first.relativePath} has no diagram. Visualize it?`
        : `${candidates.length} files have new code with no diagram. Visualize them?`;

    const GENERATE = "Generate";
    const NOT_NOW = "Not now";
    const WHY = "What triggers this?";
    const pick = await vscode.window.showInformationMessage(
      message,
      { modal: false },
      GENERATE,
      NOT_NOW,
      WHY,
    );

    if (pick === GENERATE) {
      await this.generate(first.uri);
    } else if (pick === NOT_NOW) {
      for (const c of candidates) {
        await this.dismiss(c.uri, c.sha);
      }
    } else if (pick === WHY) {
      await vscode.commands.executeCommand(OPEN_SYNC_CONFIG_COMMAND);
    }
  }

  /**
   * Accept: open the file for context and run the existing (chat-based)
   * Generate-from-Code engine, which presents a reviewable draft and never
   * writes the `.mmd` itself. Clears the nudge for this file.
   */
  async generate(uri: vscode.Uri): Promise<void> {
    analytics.sendEvent("Create On Commit Nudge Accepted", "VS_CODE_PLUGIN_CREATE_ON_COMMIT_ACCEPTED");
    this.codeLens.remove(uri.fsPath);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      // Best-effort: still launch the generator even if the file can't open.
    }
    await vscode.commands.executeCommand("mermaidChart.generateDiagramFromCode");
  }

  /** Dismiss: sticky for this file+commit so it never nags again for the same change. */
  async dismiss(uri: vscode.Uri, sha: string): Promise<void> {
    analytics.sendEvent("Create On Commit Nudge Dismissed", "VS_CODE_PLUGIN_CREATE_ON_COMMIT_DISMISSED");
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const rel = folder
      ? path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/")
      : uri.fsPath;
    await this.setDismissed(rel, sha);
    this.codeLens.remove(uri.fsPath);
  }
}

export function registerCreateOnCommit(
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  const codeLens = new CreateOnCommitCodeLensProvider();
  const service = new CreateOnCommitService(context, codeLens);
  service.start();

  return [
    codeLens,
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens),
    vscode.commands.registerCommand(GENERATE_COMMAND, (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        void service.generate(target);
      }
    }),
    vscode.commands.registerCommand(DISMISS_COMMAND, (uri: vscode.Uri, sha: string) => {
      if (uri) {
        void service.dismiss(uri, sha);
      }
    }),
  ];
}

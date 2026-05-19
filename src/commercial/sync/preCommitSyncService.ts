import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { extractMetadataFromCode } from '../../frontmatter';
import { MermaidChartAuthenticationProvider } from '../../mermaidChartAuthenticationProvider';
import type { MermaidChartVSCode } from '../../mermaidChartVSCode';

/** Maps a unified diff (+/-/ ) into the [ADDED]/[REMOVED]/[CONTEXT] format. */
function buildSourceFileContext(filePath: string, unifiedDiff: string): string {
  const lines: string[] = [];
  lines.push('=== DETAILED CHANGE SUMMARY ===');
  lines.push('Source File Changes:');
  lines.push(`MODIFIED: ${filePath} (changes detected)`);
  lines.push('');

  for (const line of unifiedDiff.split('\n')) {
    // Skip file header lines (--- a/... +++ b/...) and hunk headers (@@ ... @@)
    if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff ') ||
        line.startsWith('index ') || line.startsWith('@@')) {
      continue;
    }
    if (line.startsWith('+')) {
      lines.push(`[ADDED]   ${line.slice(1)}`);
    } else if (line.startsWith('-')) {
      lines.push(`[REMOVED] ${line.slice(1)}`);
    } else if (line.startsWith(' ')) {
      lines.push(`[CONTEXT] ${line.slice(1)}`);
    }
    // empty lines at end of diff — skip
  }

  return lines.join('\n');
}

/** Extract the resolved absolute file path from a reference string like "File: /src/auth.ts". */
function resolveReferencePath(reference: string, workspacePath: string): string | undefined {
  const match = reference.match(/File: (.*?)(\s|$|\()/);
  if (!match) return undefined;

  let filePath = match[1].trim();
  if (!filePath.includes('/') && !filePath.includes('\\')) return undefined;

  if (filePath.startsWith('/') && workspacePath) {
    filePath = path.join(workspacePath, filePath);
  }
  return filePath;
}

/** Result of a single diagram's staged-change analysis. */
interface AffectedDiagram {
  mmdUri: vscode.Uri;
  mmdFileName: string;
  stagedSourceFiles: string[];  // absolute paths of the matched staged files
}

export class PreCommitSyncService {
  private static debounceTimers = new Map<string, NodeJS.Timeout>();
  private static folderWatchers = new Map<string, fs.FSWatcher>();

  static register(context: vscode.ExtensionContext, mcAPI: MermaidChartVSCode): void {
    // vscode.workspace.createFileSystemWatcher excludes .git/** by default, so
    // we use Node's fs.watch() directly.
    // IMPORTANT: git never modifies .git/index in place — it writes to
    // .git/index.lock then atomically renames it to .git/index.
    // Watching the file inode directly goes dead after the first rename.
    // Watching the .git/ DIRECTORY and filtering for 'index' events is reliable.
    const setupWatcher = (workspaceFolder: vscode.WorkspaceFolder) => {
      const folderPath = workspaceFolder.uri.fsPath;
      const gitDir = path.join(folderPath, '.git');
      if (!fs.existsSync(gitDir)) return;

      const nodeWatcher = fs.watch(gitDir, (_eventType, filename) => {
        if (filename === 'index') {
          PreCommitSyncService.onIndexChanged(workspaceFolder, mcAPI);
        }
      });

      PreCommitSyncService.folderWatchers.set(folderPath, nodeWatcher);
      context.subscriptions.push({ dispose: () => nodeWatcher.close() });
    };

    const teardownWatcher = (workspaceFolder: vscode.WorkspaceFolder) => {
      const folderPath = workspaceFolder.uri.fsPath;
      PreCommitSyncService.folderWatchers.get(folderPath)?.close();
      PreCommitSyncService.folderWatchers.delete(folderPath);
      const timer = PreCommitSyncService.debounceTimers.get(folderPath);
      if (timer) { clearTimeout(timer); PreCommitSyncService.debounceTimers.delete(folderPath); }
    };

    (vscode.workspace.workspaceFolders ?? []).forEach(setupWatcher);
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        e.added.forEach(setupWatcher);
        e.removed.forEach(teardownWatcher);
      }),
    );
  }

  private static onIndexChanged(
    workspaceFolder: vscode.WorkspaceFolder,
    mcAPI: MermaidChartVSCode,
  ): void {
    const key = workspaceFolder.uri.fsPath;
    const existing = PreCommitSyncService.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(
      () => PreCommitSyncService.handleStagingChange(workspaceFolder, mcAPI),
      300,
    );
    PreCommitSyncService.debounceTimers.set(key, timer);
  }

  private static async handleStagingChange(
    workspaceFolder: vscode.WorkspaceFolder,
    mcAPI: MermaidChartVSCode,
  ): Promise<void> {
    const repoRoot = workspaceFolder.uri.fsPath;

    // Check if feature is enabled in settings
    const enabled = vscode.workspace
      .getConfiguration('mermaidChart')
      .get<boolean>('preCommitSync.enabled', true);
    if (!enabled) return;

    // Get staged file paths via git directly — no VSCode Git API dependency.
    // --diff-filter=ACMR: only Added, Copied, Modified, Renamed files.
    // This excludes Deleted (D) entries so unstaging or discarding changes
    // doesn't trigger the popup.
    const stagedResult = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: repoRoot, encoding: 'utf-8',
    });
    if (stagedResult.error || stagedResult.status !== 0) return;
    const stagedOutput = stagedResult.stdout.trim();
    if (!stagedOutput) return;
    const allStagedPaths = stagedOutput.split('\n').filter(Boolean).map((p) => path.join(repoRoot, p));

    // Ignore staging events that only contain .mmd/.mermaid files themselves —
    // those aren't source files that drive diagram regeneration.
    const sourceStagedPaths = allStagedPaths.filter(
      (p) => !p.endsWith('.mmd') && !p.endsWith('.mermaid'),
    );
    if (sourceStagedPaths.length === 0) return;

    // Build a set of .mmd/.mermaid paths that should be skipped:
    //   1. Already staged — regenerated and added by the user.
    //   2. Has unstaged modifications — regenerated but not yet staged, OR was
    //      staged then unstaged (git restore --staged). In both cases the
    //      regenerated content is already on disk; no popup needed.
    const stagedMmdPaths = new Set(
      allStagedPaths.filter((p) => p.endsWith('.mmd') || p.endsWith('.mermaid')),
    );

    const unstagedResult = spawnSync('git', ['diff', '--name-only'], { cwd: repoRoot, encoding: 'utf-8' });
    if (!unstagedResult.error && unstagedResult.stdout) {
      for (const rel of unstagedResult.stdout.split('\n').filter(Boolean)) {
        if (rel.endsWith('.mmd') || rel.endsWith('.mermaid')) {
          stagedMmdPaths.add(path.join(repoRoot, rel));
        }
      }
    }

    // Phase 1: run the scan inside a progress notification that closes as soon as
    // we have results. The modal popup is shown AFTER the notification dismisses.
    let affected: AffectedDiagram[] = [];
    let sourceFilesContext = new Map<string, string>();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mermaid Chart: Scanning staged files for diagram sync...',
        cancellable: false,
      },
      async () => {
        affected = await PreCommitSyncService.findAffectedDiagrams(
          workspaceFolder,
          sourceStagedPaths,
          stagedMmdPaths,
        );
        if (affected.length === 0) return;

        sourceFilesContext = await PreCommitSyncService.buildSourceFilesContext(
          repoRoot,
          affected,
        );
      },
    );

    // Phase 2: show the modal popup only after the scanning notification is gone.
    if (affected.length > 0) {
      await PreCommitSyncService.showSyncPopup(affected, sourceFilesContext, mcAPI);
    }
  }

  /**
   * Lazily scan all .mmd/.mermaid files and find which ones reference any staged source file.
   * Skips any diagram that is itself already staged — it was already regenerated and synced.
   */
  private static async findAffectedDiagrams(
    workspaceFolder: vscode.WorkspaceFolder,
    stagedPaths: string[],
    stagedMmdPaths: Set<string>,
  ): Promise<AffectedDiagram[]> {
    const mmdUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/*.{mmd,mermaid}'),
    );
    const affected: AffectedDiagram[] = [];

    for (const mmdUri of mmdUris) {
      // If the diagram file itself is already staged, it was already updated — skip.
      if (stagedMmdPaths.has(mmdUri.fsPath)) continue;

      try {
        const bytes = await vscode.workspace.fs.readFile(mmdUri);
        const text = Buffer.from(bytes).toString('utf-8');
        const metadata = extractMetadataFromCode(text);
        if (!metadata.references || metadata.references.length === 0) continue;

        const matchedStagedFiles: string[] = [];
        for (const ref of metadata.references) {
          const refPath = resolveReferencePath(ref, workspaceFolder.uri.fsPath);
          if (!refPath) continue;
          if (stagedPaths.some((sp) => sp === refPath || sp.endsWith(refPath))) {
            matchedStagedFiles.push(refPath);
          }
        }

        if (matchedStagedFiles.length > 0) {
          affected.push({
            mmdUri,
            mmdFileName: path.basename(mmdUri.fsPath),
            stagedSourceFiles: matchedStagedFiles,
          });
        }
      } catch {
        // unreadable .mmd file — skip
      }
    }
    return affected;
  }

  /**
   * For each staged source file referenced by an affected diagram,
   * run git diff --cached and convert to [ADDED]/[REMOVED]/[CONTEXT] format.
   */
  private static async buildSourceFilesContext(
    repoRoot: string,
    affected: AffectedDiagram[],
  ): Promise<Map<string, string>> {
    const relevantPaths = new Set<string>();
    for (const d of affected) {
      for (const p of d.stagedSourceFiles) relevantPaths.add(p);
    }

    const contextMap = new Map<string, string>();
    for (const absPath of relevantPaths) {
      const relPath = path.relative(repoRoot, absPath);
      const diffResult = spawnSync('git', ['diff', '--cached', '--', relPath], { cwd: repoRoot, encoding: 'utf-8' });
      const diff = (!diffResult.error && diffResult.stdout) ? diffResult.stdout : '';
      if (diff.trim()) {
        contextMap.set(absPath, buildSourceFileContext(relPath, diff));
      } else {
        // New file — no HEAD version, send full content as [ADDED]
        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          const lines = content.split('\n').map((l) => `[ADDED]   ${l}`).join('\n');
          contextMap.set(
            absPath,
            `=== DETAILED CHANGE SUMMARY ===\nSource File Changes:\nADDED: ${relPath} (new file)\n\n${lines}`,
          );
        } catch {
          // skip unreadable file
        }
      }
    }
    return contextMap;
  }

  private static async showSyncPopup(
    affected: AffectedDiagram[],
    sourceFilesContext: Map<string, string>,
    mcAPI: MermaidChartVSCode,
  ): Promise<void> {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true },
    );

    // Build the file list description
    const fileLines = affected
      .map((d) => `• ${d.stagedSourceFiles.map((p) => path.basename(p)).join(', ')} → ${d.mmdFileName}`)
      .join('\n');

    if (!session) {
      // Not logged in
      const pick = await vscode.window.showInformationMessage(
        `Pre-commit Mermaid DiagramSync: Staged changes may affect diagrams\n\n${fileLines}\n\nYou are not signed in to Mermaid Chart. Sign in to regenerate diagrams using Mermaid AI.\n\nTo disable this check: Settings → Mermaid Chart: Pre Commit Sync Enabled`,
        { modal: false },
        "Login to Mermaid Chart",
        "Discard",
      );
      if (pick === 'Login to Mermaid Chart') {
        await mcAPI.login();
      }
      return;
    }

    // Logged in
    const pick = await vscode.window.showInformationMessage(
      `Pre-commit Mermaid Diagram Sync\n\n The following staged source files are referenced by Mermaid diagrams that may be out of sync:\n\n${fileLines}\n\n Regenerate diagrams now using Mermaid AI? This will use your AI credits.\n\n To disable this: Settings → Mermaid Chart: Pre Commit Sync Enabled`,
      { modal: false },
      'Regenerate',
      'Discard',
    );

    if (pick !== 'Regenerate') return;

    // Run regeneration for each affected diagram
    for (const diagram of affected) {
      const sourceFiles = diagram.stagedSourceFiles
        .map((p) => sourceFilesContext.get(p))
        .filter((s): s is string => s !== undefined);

      await vscode.commands.executeCommand(
        'mermaidChart.regenerateDiagramWithMermaidAI',
        diagram.mmdUri,
        sourceFiles,
      );
    }
  }
}

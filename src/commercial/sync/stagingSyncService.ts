import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractMetadataFromCode, resolveReferencePath } from '../../frontmatter';
import { MermaidChartAuthenticationProvider } from '../../mermaidChartAuthenticationProvider';
import { setPendingLoginTrigger } from '../../loginTrigger';
import type { MermaidChartVSCode } from '../../mermaidChartVSCode';
import analytics from '../../analytics';
import { CreateDiagramFromStageService } from './createDiagramFromStage';
import {
  buildSourceFileContext,
  getStagedPaths,
  isMermaidFile,
  readFileAsAddedContext,
  runGit,
} from './gitStageHelpers';

/** Result of a single diagram's staged-change analysis. */
interface AffectedDiagram {
  mmdUri: vscode.Uri;
  mmdFileName: string;
  stagedSourceFiles: string[]; // absolute paths of the matched staged files
}

/**
 * Watches git staging and offers:
 * 1. Regenerate — staged sources already linked to diagrams
 * 2. Create diagram from stage — staged coding sources with no linked diagram
 */
export class StagingSyncService {
  private static debounceTimers = new Map<string, NodeJS.Timeout>();
  private static folderWatchers = new Map<string, fs.FSWatcher>();
  private static retryIntervals = new Map<string, NodeJS.Timeout>();

  static register(context: vscode.ExtensionContext, mcAPI: MermaidChartVSCode): void {
    CreateDiagramFromStageService.register(context);

    // vscode.workspace.createFileSystemWatcher excludes .git/** by default, so
    // we use Node's fs.watch() directly.
    // IMPORTANT: git never modifies .git/index in place — it writes to
    // .git/index.lock then atomically renames it to .git/index.
    // Watching the file inode directly goes dead after the first rename.
    // Watching the .git/ DIRECTORY and filtering for 'index' events is reliable.
    const setupWatcher = (workspaceFolder: vscode.WorkspaceFolder) => {
      const folderPath = workspaceFolder.uri.fsPath;
      const gitDir = path.join(folderPath, '.git');

      if (!fs.existsSync(gitDir)) {
        // .git doesn't exist yet (folder opened before git init).
        // Poll every 5s; once it appears, set up the real watcher.
        const retryInterval = setInterval(() => {
          if (fs.existsSync(gitDir) && !StagingSyncService.folderWatchers.has(folderPath)) {
            clearInterval(retryInterval);
            StagingSyncService.retryIntervals.delete(folderPath);
            setupWatcher(workspaceFolder);
          }
        }, 5000);
        StagingSyncService.retryIntervals.set(folderPath, retryInterval);

        context.subscriptions.push({
          dispose: () => {
            const interval = StagingSyncService.retryIntervals.get(folderPath);
            if (interval) {
              clearInterval(interval);
              StagingSyncService.retryIntervals.delete(folderPath);
            }
          },
        });
        return;
      }

      const nodeWatcher = fs.watch(gitDir, (_eventType, filename) => {
        if (filename === 'index') {
          StagingSyncService.onIndexChanged(workspaceFolder, mcAPI);
        }
      });

      StagingSyncService.folderWatchers.set(folderPath, nodeWatcher);

      // Look up the watcher from the map at dispose time so teardownWatcher
      // (folder removal) and subscription dispose (extension deactivate) don't
      // double-close the same watcher instance.
      context.subscriptions.push({
        dispose: () => {
          const watcher = StagingSyncService.folderWatchers.get(folderPath);
          if (watcher) {
            watcher.close();
            StagingSyncService.folderWatchers.delete(folderPath);
          }
          const timer = StagingSyncService.debounceTimers.get(folderPath);
          if (timer) {
            clearTimeout(timer);
            StagingSyncService.debounceTimers.delete(folderPath);
          }
        },
      });
    };

    const teardownWatcher = (workspaceFolder: vscode.WorkspaceFolder) => {
      const folderPath = workspaceFolder.uri.fsPath;
      const watcher = StagingSyncService.folderWatchers.get(folderPath);
      if (watcher) {
        watcher.close();
        StagingSyncService.folderWatchers.delete(folderPath);
      }
      const timer = StagingSyncService.debounceTimers.get(folderPath);
      if (timer) {
        clearTimeout(timer);
        StagingSyncService.debounceTimers.delete(folderPath);
      }
      const retryInterval = StagingSyncService.retryIntervals.get(folderPath);
      if (retryInterval) {
        clearInterval(retryInterval);
        StagingSyncService.retryIntervals.delete(folderPath);
      }
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
    const existing = StagingSyncService.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(
      () => StagingSyncService.handleStagingChange(workspaceFolder, mcAPI),
      300,
    );
    StagingSyncService.debounceTimers.set(key, timer);
  }

  private static async handleStagingChange(
    workspaceFolder: vscode.WorkspaceFolder,
    mcAPI: MermaidChartVSCode,
  ): Promise<void> {
    const repoRoot = workspaceFolder.uri.fsPath;

    const stagedPaths = await getStagedPaths(repoRoot);
    if (stagedPaths === null) {
      console.error({ repoRoot }, 'StagingSync: failed to get staged files');
      return;
    }

    // Staging events that only contain .mmd/.mermaid files aren't source changes
    // that drive diagram work.
    const sourceStagedPaths = stagedPaths.filter((p) => !isMermaidFile(p));
    if (sourceStagedPaths.length === 0) {
      return;
    }

    // Path 1 — regenerate existing linked diagrams (preCommitSync.enabled)
    const regenerateEnabled = vscode.workspace
      .getConfiguration('mermaidChart')
      .get<boolean>('preCommitSync.enabled', true);
    if (regenerateEnabled) {
      await StagingSyncService.handleRegeneratePath(
        workspaceFolder,
        sourceStagedPaths,
        stagedPaths.filter(isMermaidFile),
        mcAPI,
      );
    }

    // Path 2 — create diagram from stage for unlinked staged coding files
    await CreateDiagramFromStageService.maybeOffer(workspaceFolder, sourceStagedPaths);
  }

  private static async handleRegeneratePath(
    workspaceFolder: vscode.WorkspaceFolder,
    sourceStagedPaths: string[],
    stagedMmdFiles: string[],
    mcAPI: MermaidChartVSCode,
  ): Promise<void> {
    const repoRoot = workspaceFolder.uri.fsPath;

    // Build a set of .mmd/.mermaid paths that should be skipped:
    //   1. Already staged — regenerated and added by the user.
    //   2. Has unstaged modifications — regenerated but not yet staged, OR was
    //      staged then unstaged (git restore --staged). In both cases the
    //      regenerated content is already on disk; no popup needed.
    const stagedMmdPaths = new Set(stagedMmdFiles);

    const unstagedResult = await runGit(['diff', '--name-only'], repoRoot);
    if (unstagedResult?.stdout) {
      for (const rel of unstagedResult.stdout.split('\n').filter(Boolean)) {
        if (isMermaidFile(rel)) {
          stagedMmdPaths.add(path.join(repoRoot, rel));
        }
      }
    }

    // Phase 1: run the scan inside a progress notification that closes as soon as
    // we have results. The info toast is shown AFTER the progress notification dismisses.
    let affected: AffectedDiagram[] = [];
    let sourceFilesContext = new Map<string, string>();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mermaid Chart: Scanning staged files for diagram sync...',
        cancellable: false,
      },
      async () => {
        affected = await StagingSyncService.findAffectedDiagrams(
          workspaceFolder,
          sourceStagedPaths,
          stagedMmdPaths,
        );
        if (affected.length === 0) return;

        sourceFilesContext = await StagingSyncService.buildSourceFilesContext(
          repoRoot,
          affected,
        );
      },
    );

    // Phase 2: show the info toast only after the scanning notification is gone.
    if (affected.length > 0) {
      await StagingSyncService.showSyncPopup(affected, sourceFilesContext, mcAPI);
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

          // Normalize both to absolute paths and compare with strict equality.
          // Push the staged path (not refPath) so downstream git diff uses the
          // exact path that came from git output.
          const normalizedRef = path.normalize(refPath);
          const matchedStagedPath = stagedPaths.find(
            (sp) => path.normalize(sp) === normalizedRef,
          );
          if (matchedStagedPath) {
            matchedStagedFiles.push(matchedStagedPath);
          }
        }

        if (matchedStagedFiles.length > 0) {
          affected.push({
            mmdUri,
            mmdFileName: path.basename(mmdUri.fsPath),
            stagedSourceFiles: matchedStagedFiles,
          });
        }
      } catch (error) {
        console.error(
          { mmdUri: mmdUri.fsPath, error },
          'StagingSync: failed to read diagram file',
        );
      }
    }
    return affected;
  }

  /**
   * For each staged source file referenced by an affected diagram, build
   * [ADDED]/[REMOVED]/[CONTEXT] context strings. Uses a single batched
   * git diff --cached call to avoid one fork per file.
   */
  private static async buildSourceFilesContext(
    repoRoot: string,
    affected: AffectedDiagram[],
  ): Promise<Map<string, string>> {
    const relevantPaths = new Set<string>();
    for (const d of affected) {
      for (const p of d.stagedSourceFiles) relevantPaths.add(p);
    }

    // path.relative on Windows produces backslashes; git always expects forward slashes.
    const relPaths = [...relevantPaths].map((p) => path.relative(repoRoot, p).replace(/\\/g, '/'));

    // Single git call for all relevant files — avoids a process fork per file.
    const diffResult = await runGit(['diff', '--cached', '--', ...relPaths], repoRoot);
    const combinedDiff = diffResult?.stdout ?? '';

    // Split combined diff output per file on "diff --git" section boundaries.
    const diffsByFile = new Map<string, string>();
    if (combinedDiff.trim()) {
      const fileSections = combinedDiff.split(/^(?=diff --git )/m);
      for (const section of fileSections) {
        if (!section.trim()) continue;
        const headerMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);
        if (!headerMatch) continue;
        const absPath = path.join(repoRoot, headerMatch[1].trim());
        if (relevantPaths.has(absPath)) {
          diffsByFile.set(absPath, section);
        }
      }
    }

    const contextMap = new Map<string, string>();
    for (const absPath of relevantPaths) {
      const relPath = path.relative(repoRoot, absPath);
      const diff = diffsByFile.get(absPath) ?? '';
      if (diff.trim()) {
        contextMap.set(absPath, buildSourceFileContext(relPath, diff));
      } else {
        // New file — no HEAD version, send full content as [ADDED]
        const added = await readFileAsAddedContext(absPath, relPath);
        if (added) {
          contextMap.set(absPath, added);
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
      .map(
        (d) =>
          `• ${d.stagedSourceFiles.map((p) => path.basename(p)).join(', ')} → ${d.mmdFileName}`,
      )
      .join('\n');

    if (!session) {
      analytics.trackSignInPromptShown('pre-commit');
      const pick = await vscode.window.showInformationMessage(
        `Pre-commit Mermaid Diagram Sync: Staged changes may affect diagrams\n\n${fileLines}\n\nYou are not signed in to Mermaid Chart. Sign in to regenerate diagrams using Mermaid AI.\n\nTo disable this check: Settings → Mermaid Chart: Pre Commit Sync Enabled`,
        { modal: false },
        'Login to Mermaid Chart',
        'Discard',
      );
      if (pick === 'Login to Mermaid Chart') {
        analytics.trackSignInPromptClicked('pre-commit');
        setPendingLoginTrigger('pre-commit');
        await vscode.commands.executeCommand('mermaidChart.login', 'pre-commit');
      }
      return;
    }

    const pick = await vscode.window.showInformationMessage(
      `Pre-commit Mermaid Diagram Sync\n\n The following staged source files are referenced by Mermaid diagrams that may be out of sync:\n\n${fileLines}\n\n Regenerate diagrams now using Mermaid AI? This will use your AI credits.\n\n To disable this: Settings → Mermaid Chart: Pre Commit Sync Enabled`,
      { modal: false },
      'Regenerate',
      'Discard',
    );

    if (pick !== 'Regenerate') return;
    analytics.trackPreCommitDiagramRegenerate();

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

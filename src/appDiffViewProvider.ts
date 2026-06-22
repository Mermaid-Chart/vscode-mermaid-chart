import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "node:os";
import { AppReviewIntegration, type ReviewFileMapping } from "./appReviewIntegration";
import { pathsEqualAbsolute } from "./appReviewPaths";
import { AppFileDecorationProvider } from "./appFileDecorationProvider";
import { openAppReviewDiagramSurface } from "./commercial/sync/diagramDiffView";

function fileUrisMatch(a: vscode.Uri, b: vscode.Uri, integration: AppReviewIntegration): boolean {
  if (a.scheme !== b.scheme) {
    return false;
  }
  if (a.toString() === b.toString()) {
    return true;
  }
  const relA = integration.lookupRepoRelativeKey(a.fsPath);
  const relB = integration.lookupRepoRelativeKey(b.fsPath);
  if (relA && relB) {
    return relA === relB;
  }
  return pathsEqualAbsolute(a.fsPath, b.fsPath);
}

/**
 * OS temp holds left (before sync) + right (current workspace) until the diff tab closes.
 * Save right → original file. Close diff tab → delete temps (diagram review webview stays open).
 */
type AppCodeDiffSession = {
  originalTempUri: vscode.Uri;
  /** Right side of the diff — the real workspace diagram file. */
  modifiedUri: vscode.Uri;
  sessionDirUri: vscode.Uri;
  saveDisposable: vscode.Disposable;
  tabCloseDisposable: vscode.Disposable;
  cleaned: boolean;
};

type AppMultiDiffEntry = {
  originalFilePath: string;
  originalTempUri: vscode.Uri;
  modifiedUri: vscode.Uri;
};

type AppMultiDiffSession = {
  title: string;
  sessionDirUri: vscode.Uri;
  multiDiffSourceUri?: vscode.Uri;
  entries: AppMultiDiffEntry[];
  disposables: vscode.Disposable;
  onClosed?: () => void;
  cleaned: boolean;
};

type AppReviewPanelSession = {
  originalFilePath: string;
  mapping: ReviewFileMapping;
  closePanels: () => void;
  refreshFromContent?: (updatedContent: string) => Promise<void>;
  refreshDebounceTimer?: ReturnType<typeof setTimeout>;
  workspaceDisposables: vscode.Disposable[];
  panelDisposable?: vscode.Disposable;
  codeDiff?: AppCodeDiffSession;
  cleaned: boolean;
};

/**
 * Opens the review-diagram webview (Now + chrome) for Mermaid Sync app-review files.
 */
export class AppDiffViewProvider {
  private readonly sessionsByOriginal = new Map<string, AppReviewPanelSession>();
  private readonly diffSaveByPath = new Map<string, vscode.Disposable>();
  private multiDiffSession: AppMultiDiffSession | null = null;

  constructor(
    private readonly appReviewIntegration: AppReviewIntegration,
    private readonly fileDecorationProvider: AppFileDecorationProvider
  ) {}

  async restoreAppProposalAndPending(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }
    try {
      await this.cancelSessionsForOriginal(mapping.originalFilePath);
      const botContent = await this.appReviewIntegration.fetchAppContentAtHead(fileUri.fsPath);
      if (botContent === null) {
        vscode.window.showErrorMessage(
          `Could not load Mermaid Sync app proposal from GitHub for ${path.basename(mapping.originalFilePath)}.`
        );
        return;
      }
      await this.replaceOriginalFileContent(mapping.originalFilePath, botContent);
      mapping.status = "pending";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "pending");
      this.appReviewIntegration.notifyReviewMappingsChanged();
      vscode.window.showInformationMessage(
        `Restored Mermaid Sync app proposal for ${path.basename(mapping.originalFilePath)}. Status: review pending.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error restoring Mermaid Sync app proposal: ${error}`);
    }
  }

  async cancelSessionsForOriginal(originalFilePath: string): Promise<void> {
    const session = this.sessionsByOriginal.get(path.normalize(originalFilePath));
    if (session) {
      await this.cleanupAppReviewSession(session);
    }
  }

  /** `fileUri` must be the real workspace diagram file. */
  async showAppDiff(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      vscode.window.showErrorMessage(
        "No active Mermaid Sync app review for this file. Run MermaidChart: Review Mermaid Sync from the command palette."
      );
      return;
    }

    await this.cancelSessionsForOriginal(mapping.originalFilePath);

    const currentContent = await this.readCurrentWorkspaceContent(mapping.originalFilePath);
    const diagramUri = vscode.Uri.file(mapping.originalFilePath);

    const { closePanels, panel, refreshFromContent } = await openAppReviewDiagramSurface(
      diagramUri,
      mapping.originalContent,
      currentContent,
      {
        onViewDiffCode: () => {
          void this.openCodeDiff(fileUri);
        },
      },
    );

    if (!panel) {
      return;
    }

    const normalizedPath = path.normalize(mapping.originalFilePath);
    const session: AppReviewPanelSession = {
      originalFilePath: mapping.originalFilePath,
      mapping,
      closePanels,
      refreshFromContent,
      workspaceDisposables: [],
      cleaned: false,
    };

    const scheduleReviewRefresh = (): void => {
      if (session.cleaned) {
        return;
      }
      const prev = session.refreshDebounceTimer;
      if (prev) {
        clearTimeout(prev);
      }
      session.refreshDebounceTimer = setTimeout(() => {
        session.refreshDebounceTimer = undefined;
        void this.refreshReviewPanel(session);
      }, 350);
    };

    session.workspaceDisposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          event.document.uri.scheme === "file" &&
          pathsEqualAbsolute(event.document.uri.fsPath, normalizedPath)
        ) {
          scheduleReviewRefresh();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        if (
          saved.uri.scheme === "file" &&
          pathsEqualAbsolute(saved.uri.fsPath, normalizedPath)
        ) {
          scheduleReviewRefresh();
        }
      }),
    );

    session.panelDisposable = panel.onDidDispose(() => {
      void this.cleanupAppReviewSession(session);
    });

    this.sessionsByOriginal.set(normalizedPath, session);
  }

  private async refreshReviewPanel(session: AppReviewPanelSession): Promise<void> {
    if (session.cleaned || !session.refreshFromContent) {
      return;
    }
    const content = await this.readCurrentWorkspaceContent(session.originalFilePath);
    session.mapping.appContent = content;
    await session.refreshFromContent(content);
  }

  private async readCurrentWorkspaceContent(originalFilePath: string): Promise<string> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.scheme === "file" && pathsEqualAbsolute(d.uri.fsPath, originalFilePath)
    );
    if (openDoc) {
      return openDoc.getText();
    }

    const uri = vscode.Uri.file(originalFilePath);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString("utf8");
    } catch {
      return this.appReviewIntegration.getReviewMapping(originalFilePath)?.appContent ?? "";
    }
  }

  /**
   * Diff pair for {@link openCodeDiff} and {@link openAllReviewChanges}:
   * left = PR-base snapshot (temp), right = live workspace file (same as Git Changes).
   */
  private reviewTempBaseName(relativePath: string): string {
    const hash = crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 12);
    const baseName = path.basename(relativePath).replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${hash}__${baseName}.base.mmd`;
  }

  private async prepareCodeDiffPair(
    mapping: ReviewFileMapping,
    sessionDir: string,
  ): Promise<{ originalTempUri: vscode.Uri; modifiedUri: vscode.Uri }> {
    const originalTempUri = vscode.Uri.file(
      path.join(sessionDir, this.reviewTempBaseName(mapping.relativePath)),
    );
    const modifiedUri = vscode.Uri.file(mapping.originalFilePath);

    await vscode.workspace.fs.writeFile(
      originalTempUri,
      Buffer.from(mapping.originalContent, "utf8"),
    );

    return { originalTempUri, modifiedUri };
  }

  private applyIncomingDiffSave(
    originalFilePath: string,
    text: string,
    panelSession?: AppReviewPanelSession,
  ): void {
    const mapping = this.appReviewIntegration.getReviewMapping(originalFilePath);
    if (!mapping) {
      return;
    }
    void (async () => {
      try {
        await this.replaceOriginalFileContent(originalFilePath, text);
        mapping.appContent = text;
        mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(originalFilePath, "modified");
        this.appReviewIntegration.notifyReviewMappingsChanged();
        if (panelSession) {
          void this.refreshReviewPanel(panelSession);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Could not save to diagram file: ${err}`);
      }
    })();
  }

  private wireCodeDiffSave(
    modifiedUri: vscode.Uri,
    originalFilePath: string,
    panelSession?: AppReviewPanelSession,
  ): vscode.Disposable {
    const key = path.normalize(originalFilePath);
    this.diffSaveByPath.get(key)?.dispose();

    const listener = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (!fileUrisMatch(saved.uri, modifiedUri, this.appReviewIntegration)) {
        return;
      }
      this.applyIncomingDiffSave(originalFilePath, saved.getText(), panelSession);
    });
    this.diffSaveByPath.set(key, listener);

    return new vscode.Disposable(() => {
      listener.dispose();
      if (this.diffSaveByPath.get(key) === listener) {
        this.diffSaveByPath.delete(key);
      }
    });
  }

  private async buildReviewChangesResources(
    mappings: ReviewFileMapping[],
    sessionDir: string,
  ): Promise<{
    resources: [vscode.Uri, vscode.Uri, vscode.Uri][];
    entries: AppMultiDiffEntry[];
  }> {
    const resources: [vscode.Uri, vscode.Uri, vscode.Uri][] = [];
    const entries: AppMultiDiffEntry[] = [];

    for (const mapping of mappings) {
      const { originalTempUri, modifiedUri } = await this.prepareCodeDiffPair(mapping, sessionDir);
      resources.push([modifiedUri, originalTempUri, modifiedUri]);
      entries.push({
        originalFilePath: mapping.originalFilePath,
        originalTempUri,
        modifiedUri,
      });
    }

    return { resources, entries };
  }

  /**
   * Opens (or focuses) native vscode.diff for app review — PLUG-72 flow, on demand from Diff code.
   */
  async openCodeDiff(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      vscode.window.showErrorMessage("No active Mermaid Sync app review for this file.");
      return;
    }

    const panelSession = this.sessionsByOriginal.get(path.normalize(mapping.originalFilePath));
    const modifiedUri = vscode.Uri.file(mapping.originalFilePath);

    if (panelSession?.codeDiff && !panelSession.codeDiff.cleaned) {
      const codeDiff = panelSession.codeDiff;
      const diffTitle = `App review: ${path.basename(mapping.originalFilePath)}`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        codeDiff.originalTempUri,
        modifiedUri,
        diffTitle,
        { preview: false, viewColumn: vscode.ViewColumn.Beside },
      );
      return;
    }

    const id = crypto.randomBytes(8).toString("hex");
    const sessionDir = path.join(os.tmpdir(), "vscode-mermaid-chart-app-review", id);
    const sessionDirUri = vscode.Uri.file(sessionDir);
    try {
      await vscode.workspace.fs.createDirectory(sessionDirUri);
    } catch {
      /* exists */
    }

    let originalTempUri: vscode.Uri;
    try {
      ({ originalTempUri } = await this.prepareCodeDiffPair(mapping, sessionDir));
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create temp review files: ${e}`);
      return;
    }

    const diffTitle = `App review: ${path.basename(mapping.originalFilePath)}`;
    await vscode.commands.executeCommand("vscode.diff", originalTempUri, modifiedUri, diffTitle, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });

    const saveDisposable = this.wireCodeDiffSave(modifiedUri, mapping.originalFilePath, panelSession);

    const codeDiffSession: AppCodeDiffSession = {
      originalTempUri,
      modifiedUri,
      sessionDirUri,
      saveDisposable,
      tabCloseDisposable: vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        for (const tab of closed) {
          if (tab.input instanceof vscode.TabInputTextDiff) {
            const { original, modified } = tab.input;
            if (
              fileUrisMatch(original, originalTempUri, this.appReviewIntegration) &&
              fileUrisMatch(modified, modifiedUri, this.appReviewIntegration)
            ) {
              void this.cleanupCodeDiffSession(panelSession, codeDiffSession);
              return;
            }
          }
        }
      }),
      cleaned: false,
    };

    if (panelSession) {
      panelSession.codeDiff = codeDiffSession;
    }
  }

  /**
   * Git-style unified changes editor — reuses {@link prepareCodeDiffPair} (same as Diff code).
   */
  async openAllReviewChanges(options: {
    multiDiffSourceUri?: vscode.Uri;
    onMultiDiffClosed?: () => void;
  } = {}): Promise<void> {
    const { multiDiffSourceUri, onMultiDiffClosed } = options;
    const mappings = [...this.appReviewIntegration.getReviewMappings().values()].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );
    if (mappings.length === 0) {
      vscode.window.showInformationMessage("No diagrams in review.");
      return;
    }

    await this.cleanupMultiDiffSession();

    const id = crypto.randomBytes(8).toString("hex");
    const sessionDir = path.join(os.tmpdir(), "vscode-mermaid-chart-app-review-multi", id);
    const sessionDirUri = vscode.Uri.file(sessionDir);
    try {
      await vscode.workspace.fs.createDirectory(sessionDirUri);
    } catch {
      /* exists */
    }

    let resources: [vscode.Uri, vscode.Uri, vscode.Uri][];
    let entries: AppMultiDiffEntry[];

    try {
      ({ resources, entries } = await this.buildReviewChangesResources(mappings, sessionDir));
    } catch (e) {
      vscode.window.showErrorMessage(`Could not prepare review changes: ${e}`);
      onMultiDiffClosed?.();
      try {
        await vscode.workspace.fs.delete(sessionDirUri, { recursive: true });
      } catch {
        /* ignore */
      }
      return;
    }

    const title = `Mermaid Sync: Changes (${mappings.length} files)`;

    const multiDiffResources = resources.map(([, originalUri, modifiedUri]) => ({
      originalUri,
      modifiedUri,
    }));

    try {
      await vscode.commands.executeCommand("_workbench.openMultiDiffEditor", {
        title,
        multiDiffSourceUri,
        resources: multiDiffResources,
      });
    } catch {
      try {
        await vscode.commands.executeCommand("vscode.changes", title, resources);
      } catch (e) {
        vscode.window.showErrorMessage(
          `Could not open changes view. Update VS Code or open diffs from each file. ${e}`,
        );
        onMultiDiffClosed?.();
        try {
          await vscode.workspace.fs.delete(sessionDirUri, { recursive: true });
        } catch {
          /* ignore */
        }
        return;
      }
    }

    const saveDisposables = entries.map((entry) => {
      const panelSession = this.sessionsByOriginal.get(path.normalize(entry.originalFilePath));
      return this.wireCodeDiffSave(entry.modifiedUri, entry.originalFilePath, panelSession);
    });

    const tabCloseDisposable = vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
      for (const tab of closed) {
        if (this.isOurMultiDiffTab(tab, multiDiffSourceUri, title)) {
          void this.cleanupMultiDiffSession();
          return;
        }
      }
    });

    this.multiDiffSession = {
      title,
      sessionDirUri,
      multiDiffSourceUri,
      entries,
      disposables: vscode.Disposable.from(...saveDisposables, tabCloseDisposable),
      onClosed: onMultiDiffClosed,
      cleaned: false,
    };
  }

  private isOurMultiDiffTab(
    tab: vscode.Tab,
    multiDiffSourceUri: vscode.Uri | undefined,
    title: string,
  ): boolean {
    const input = tab.input as { multiDiffSource?: vscode.Uri } | undefined;
    if (
      multiDiffSourceUri &&
      input &&
      input.multiDiffSource instanceof vscode.Uri &&
      input.multiDiffSource.toString() === multiDiffSourceUri.toString()
    ) {
      return true;
    }
    return tab.label === title || tab.label.startsWith("Mermaid Sync: Changes");
  }

  async cleanupMultiDiffSession(): Promise<void> {
    const session = this.multiDiffSession;
    if (!session || session.cleaned) {
      return;
    }
    session.cleaned = true;
    this.multiDiffSession = null;
    session.disposables.dispose();
    session.onClosed?.();
    try {
      await vscode.workspace.fs.delete(session.sessionDirUri, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  private async cleanupCodeDiffSession(
    panelSession: AppReviewPanelSession | undefined,
    codeDiff: AppCodeDiffSession,
  ): Promise<void> {
    if (codeDiff.cleaned) {
      return;
    }
    codeDiff.cleaned = true;

    if (panelSession?.codeDiff === codeDiff) {
      panelSession.codeDiff = undefined;
    }

    try {
      codeDiff.saveDisposable.dispose();
      codeDiff.tabCloseDisposable.dispose();
      await vscode.workspace.fs.delete(codeDiff.sessionDirUri, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  private async cleanupAppReviewSession(session: AppReviewPanelSession): Promise<void> {
    if (session.cleaned) {
      return;
    }
    session.cleaned = true;
    this.sessionsByOriginal.delete(path.normalize(session.originalFilePath));
    if (session.refreshDebounceTimer) {
      clearTimeout(session.refreshDebounceTimer);
      session.refreshDebounceTimer = undefined;
    }
    for (const disposable of session.workspaceDisposables) {
      disposable.dispose();
    }
    session.workspaceDisposables.length = 0;
    if (session.codeDiff && !session.codeDiff.cleaned) {
      await this.cleanupCodeDiffSession(session, session.codeDiff);
    }
    session.panelDisposable?.dispose();
    try {
      session.closePanels();
    } catch {
      /* best-effort */
    }
  }

  private async replaceOriginalFileContent(originalFilePath: string, text: string): Promise<void> {
    const uri = vscode.Uri.file(originalFilePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, fullRange, text);
      await vscode.workspace.applyEdit(edit);
    } catch {
      /* buffer update failed — disk write is sufficient for git */
    }
  }

  async acceptAppChanges(
    fileUri: vscode.Uri,
    options: { silent?: boolean; notify?: boolean } = {},
  ): Promise<boolean> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return false;
    }
    try {
      await this.cancelSessionsForOriginal(mapping.originalFilePath);
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.appContent);
      mapping.status = "accepted";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "accepted");
      if (options.notify !== false) {
        this.appReviewIntegration.notifyReviewMappingsChanged();
      }
      if (!options.silent) {
        const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `App changes applied to ${path.basename(mapping.originalFilePath)}`
        );
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        vscode.window.showErrorMessage(`Error accepting app changes: ${error}`);
      }
      return false;
    }
  }

  async rejectAppChanges(
    fileUri: vscode.Uri,
    options: { silent?: boolean; notify?: boolean } = {},
  ): Promise<boolean> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return false;
    }
    try {
      await this.cancelSessionsForOriginal(mapping.originalFilePath);
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.originalContent);
      mapping.status = "rejected";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "rejected");
      if (options.notify !== false) {
        this.appReviewIntegration.notifyReviewMappingsChanged();
      }
      if (!options.silent) {
        const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `${path.basename(mapping.originalFilePath)}: restored to the version from before the Mermaid Sync app update.`
        );
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        vscode.window.showErrorMessage(`Error rejecting app changes: ${error}`);
      }
      return false;
    }
  }

  dispose(): void {
    void this.cleanupMultiDiffSession();
    for (const session of [...this.sessionsByOriginal.values()]) {
      if (session.codeDiff && !session.codeDiff.cleaned) {
        session.codeDiff.saveDisposable.dispose();
        session.codeDiff.tabCloseDisposable.dispose();
      }
      void this.cleanupAppReviewSession(session);
    }
  }
}

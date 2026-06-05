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
  incomingTempUri: vscode.Uri;
  incomingKey: string;
  saveDisposable: vscode.Disposable;
  tabCloseDisposable: vscode.Disposable;
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
   * Opens (or focuses) native vscode.diff for app review — PLUG-72 flow, on demand from Diff code.
   */
  async openCodeDiff(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      vscode.window.showErrorMessage("No active Mermaid Sync app review for this file.");
      return;
    }

    const panelSession = this.sessionsByOriginal.get(path.normalize(mapping.originalFilePath));
    const currentContent = await this.readCurrentWorkspaceContent(mapping.originalFilePath);

    if (panelSession?.codeDiff && !panelSession.codeDiff.cleaned) {
      const codeDiff = panelSession.codeDiff;
      try {
        await vscode.workspace.fs.writeFile(
          codeDiff.incomingTempUri,
          Buffer.from(currentContent, "utf8"),
        );
      } catch (e) {
        vscode.window.showErrorMessage(`Could not refresh review diff: ${e}`);
        return;
      }

      const diffTitle = `App review: ${path.basename(mapping.originalFilePath)}`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        codeDiff.originalTempUri,
        codeDiff.incomingTempUri,
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

    const safeBase = path.basename(mapping.originalFilePath).replace(/[^a-zA-Z0-9._-]/g, "_");
    const originalTempUri = vscode.Uri.file(path.join(sessionDir, `${safeBase}.base.mmd`));
    const incomingTempUri = vscode.Uri.file(path.join(sessionDir, `${safeBase}.incoming.mmd`));
    const incomingKey = path.normalize(incomingTempUri.fsPath);

    try {
      await vscode.workspace.fs.writeFile(
        originalTempUri,
        Buffer.from(mapping.originalContent, "utf8"),
      );
      await vscode.workspace.fs.writeFile(
        incomingTempUri,
        Buffer.from(currentContent, "utf8"),
      );
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create temp review files: ${e}`);
      return;
    }

    const diffTitle = `App review: ${path.basename(mapping.originalFilePath)}`;
    await vscode.commands.executeCommand("vscode.diff", originalTempUri, incomingTempUri, diffTitle, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });

    const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (saved) => {
      if (!fileUrisMatch(saved.uri, incomingTempUri, this.appReviewIntegration)) {
        return;
      }
      try {
        const text = saved.getText();
        await this.replaceOriginalFileContent(mapping.originalFilePath, text);
        mapping.appContent = text;
        mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "modified");
        this.appReviewIntegration.notifyReviewMappingsChanged();
        if (panelSession) {
          void this.refreshReviewPanel(panelSession);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Could not save to diagram file: ${err}`);
      }
    });

    const codeDiffSession: AppCodeDiffSession = {
      originalTempUri,
      incomingTempUri,
      incomingKey,
      saveDisposable,
      tabCloseDisposable: vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        for (const tab of closed) {
          if (tab.input instanceof vscode.TabInputTextDiff) {
            const { original, modified } = tab.input;
            if (
              fileUrisMatch(original, originalTempUri, this.appReviewIntegration) &&
              fileUrisMatch(modified, incomingTempUri, this.appReviewIntegration)
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

    let contentToApply: string | undefined;
    try {
      try {
        await vscode.workspace.fs.stat(codeDiff.incomingTempUri);
        const rightDoc = await vscode.workspace.openTextDocument(codeDiff.incomingTempUri);
        if (rightDoc.isDirty) {
          vscode.window.showInformationMessage(
            "App review diff closed with unsaved changes on the right.",
          );
        } else {
          contentToApply = rightDoc.getText();
        }
      } catch {
        /* temp gone */
      }
    } finally {
      codeDiff.saveDisposable.dispose();
      codeDiff.tabCloseDisposable.dispose();
      try {
        await vscode.workspace.fs.delete(
          vscode.Uri.file(path.dirname(codeDiff.incomingTempUri.fsPath)),
          { recursive: true },
        );
      } catch {
        /* ignore */
      }
    }

    if (contentToApply !== undefined && panelSession) {
      try {
        await this.replaceOriginalFileContent(panelSession.mapping.originalFilePath, contentToApply);
        panelSession.mapping.appContent = contentToApply;
        panelSession.mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(panelSession.mapping.originalFilePath, "modified");
        this.appReviewIntegration.notifyReviewMappingsChanged();
        void this.refreshReviewPanel(panelSession);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to apply changes on diff close: ${err}`);
      }
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

  async acceptAppChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }
    try {
      await this.cancelSessionsForOriginal(mapping.originalFilePath);
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.appContent);
      mapping.status = "accepted";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "accepted");
      this.appReviewIntegration.notifyReviewMappingsChanged();
      const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `App changes applied to ${path.basename(mapping.originalFilePath)}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error accepting app changes: ${error}`);
    }
  }

  async rejectAppChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }
    try {
      await this.cancelSessionsForOriginal(mapping.originalFilePath);
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.originalContent);
      mapping.status = "rejected";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "rejected");
      this.appReviewIntegration.notifyReviewMappingsChanged();
      const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `${path.basename(mapping.originalFilePath)}: restored to the version from before the Mermaid Sync app update.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error rejecting app changes: ${error}`);
    }
  }

  dispose(): void {
    for (const session of [...this.sessionsByOriginal.values()]) {
      if (session.codeDiff && !session.codeDiff.cleaned) {
        session.codeDiff.saveDisposable.dispose();
        session.codeDiff.tabCloseDisposable.dispose();
      }
      void this.cleanupAppReviewSession(session);
    }
  }
}

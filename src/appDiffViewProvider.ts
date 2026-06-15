import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "node:os";
import { AppReviewIntegration, type ReviewFileMapping } from "./appReviewIntegration";
import { pathsEqualAbsolute } from "./appReviewPaths";
import { AppFileDecorationProvider } from "./appFileDecorationProvider";
import { openDiagramDiffWebviews } from "./commercial/sync/diagramDiffView";

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

function sameReviewedFile(
  absolutePath: string,
  mapping: ReviewFileMapping,
  integration: AppReviewIntegration
): boolean {
  const rel = integration.lookupRepoRelativeKey(absolutePath);
  return rel !== null && rel === mapping.relativePath;
}

/**
 * OS temp holds left (PR base) + right (current workspace file) until the diff tab closes.
 * Save right → original file (WorkspaceEdit). Close diff tab → dispose diagram previews + delete temps.
 */
type AppDiffSession = {
  originalFilePath: string;
  originalTempUri: vscode.Uri;
  incomingTempUri: vscode.Uri;
  incomingKey: string;
  mapping: ReviewFileMapping;
  disposeDiagramPanels: (() => void) | undefined;
  saveDisposable: vscode.Disposable;
  tabCloseDisposable: vscode.Disposable;
  cleaned: boolean;
};

export class AppDiffViewProvider {
  private readonly sessionsByIncoming = new Map<string, AppDiffSession>();

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

  /** Close any open app diff session for this diagram (e.g. before Submit). */
  async cancelSessionsForOriginal(originalFilePath: string): Promise<void> {
    for (const s of [...this.sessionsByIncoming.values()]) {
      if (sameReviewedFile(originalFilePath, s.mapping, this.appReviewIntegration)) {
        await this.cleanupAppDiffSession(s);
      }
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

    const existing = this.findSessionByOriginal(mapping.originalFilePath);
    if (existing) {
      await this.cleanupAppDiffSession(existing);
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
    const currentContent = await this.readCurrentWorkspaceContent(mapping.originalFilePath);

    try {
      await vscode.workspace.fs.writeFile(
        originalTempUri,
        Buffer.from(mapping.originalContent, "utf8")
      );
      await vscode.workspace.fs.writeFile(
        incomingTempUri,
        Buffer.from(currentContent, "utf8")
      );
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create temp review files: ${e}`);
      return;
    }

    const diffTitle = `App review: ${path.basename(mapping.originalFilePath)}`;
    await vscode.commands.executeCommand("vscode.diff", originalTempUri, incomingTempUri, diffTitle, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });

    /** Let the diff editor attach before layout + webviews (same flow as repair / remote sync). */
    await new Promise<void>((r) => setTimeout(r, 280));

    let disposeDiagramPanels: (() => void) | undefined;
    try {
      disposeDiagramPanels = openDiagramDiffWebviews(mapping.originalContent, currentContent, {
        currentRepairDocumentUri: originalTempUri,
        incomingRepairDocumentUri: incomingTempUri,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showWarningMessage(`Code diff opened, but diagram previews failed: ${msg}`);
    }

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
      } catch (err) {
        vscode.window.showErrorMessage(`Could not save to diagram file: ${err}`);
      }
    });

    const session: AppDiffSession = {
      originalFilePath: mapping.originalFilePath,
      originalTempUri,
      incomingTempUri,
      incomingKey,
      mapping,
      disposeDiagramPanels,
      saveDisposable,
      tabCloseDisposable: vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        for (const tab of closed) {
          if (tab.input instanceof vscode.TabInputTextDiff) {
            const { original, modified } = tab.input;
            if (
              fileUrisMatch(original, originalTempUri, this.appReviewIntegration) &&
              fileUrisMatch(modified, incomingTempUri, this.appReviewIntegration)
            ) {
              void this.cleanupAppDiffSession(session);
              return;
            }
          }
        }
      }),
      cleaned: false,
    };

    this.sessionsByIncoming.set(incomingKey, session);

    vscode.window.showInformationMessage(
      "Save the right side of the diff to update your diagram. Closing the diff closes previews and removes temp files.",
      "OK"
    );
  }

  /** Open editor buffer (incl. unsaved edits), else disk, else cached appContent. */
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

  private findSessionByOriginal(originalFilePath: string): AppDiffSession | undefined {
    for (const s of this.sessionsByIncoming.values()) {
      if (sameReviewedFile(originalFilePath, s.mapping, this.appReviewIntegration)) {
        return s;
      }
    }
    return undefined;
  }

  /** Write diagram content to disk so `git status` and Commit CodeLens see the change. */
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

  private async cleanupAppDiffSession(session: AppDiffSession): Promise<void> {
    if (session.cleaned) {
      return;
    }
    session.cleaned = true;
    this.sessionsByIncoming.delete(session.incomingKey);

    let contentToApply: string | undefined;
    try {
      try {
        await vscode.workspace.fs.stat(session.incomingTempUri);
        const rightDoc = await vscode.workspace.openTextDocument(session.incomingTempUri);
        if (rightDoc.isDirty) {
          vscode.window.showInformationMessage(
            "App review diff closed with unsaved changes on the right."
          );
        } else {
          contentToApply = rightDoc.getText();
        }
      } catch {
        /* temp gone */
      }
    } catch (err) {
      // cleanup read error — proceed to finally block
    } finally {
      session.disposeDiagramPanels?.();
      session.saveDisposable.dispose();
      session.tabCloseDisposable.dispose();
      try {
        await vscode.workspace.fs.delete(
          vscode.Uri.file(path.dirname(session.incomingTempUri.fsPath)),
          { recursive: true }
        );
      } catch {
        /* ignore */
      }
    }

    if (contentToApply !== undefined) {
      try {
        await this.replaceOriginalFileContent(session.mapping.originalFilePath, contentToApply);
        session.mapping.appContent = contentToApply;
        session.mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(session.mapping.originalFilePath, "modified");
        this.appReviewIntegration.notifyReviewMappingsChanged();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to apply changes on diff close: ${err}`);
      }
    }
  }

  async acceptAppChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }
    try {
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.appContent);
      mapping.status = "accepted";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "accepted");
      this.appReviewIntegration.notifyReviewMappingsChanged();
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
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
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.originalContent);
      mapping.status = "rejected";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "rejected");
      this.appReviewIntegration.notifyReviewMappingsChanged();
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
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
    for (const session of this.sessionsByIncoming.values()) {
      session.saveDisposable.dispose();
      session.tabCloseDisposable.dispose();
      session.disposeDiagramPanels?.();
    }
    this.sessionsByIncoming.clear();
  }
}

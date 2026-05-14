import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "node:os";
import { BotReviewIntegration, type ReviewFileMapping } from "./botReviewIntegration";
import { BotFileDecorationProvider } from "./botFileDecorationProvider";
import { openDiagramDiffWebviews } from "./commercial/sync/diagramDiffView";

function fileUrisMatch(a: vscode.Uri, b: vscode.Uri): boolean {
  if (a.scheme !== b.scheme) {
    return false;
  }
  if (a.toString() === b.toString()) {
    return true;
  }
  return path.normalize(a.fsPath) === path.normalize(b.fsPath);
}

/**
 * OS temp holds left (PR base) + right (bot) until the diff tab closes — avoids untracked `.temp/` in the repo.
 * Save right → original file (WorkspaceEdit). Close diff tab → dispose diagram previews + delete temps.
 */
type BotDiffSession = {
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

export class BotDiffViewProvider {
  private readonly sessionsByIncoming = new Map<string, BotDiffSession>();

  constructor(
    private readonly botReviewIntegration: BotReviewIntegration,
    private readonly fileDecorationProvider: BotFileDecorationProvider
  ) {}

  async restoreBotProposalAndPending(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.botReviewIntegration.getReviewMapping(path.normalize(fileUri.fsPath));
    if (!mapping) {
      return;
    }
    try {
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.botContent);
      mapping.status = "pending";
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "pending");
      this.botReviewIntegration.notifyReviewMappingsChanged();
      vscode.window.showInformationMessage(
        `Restored bot proposal for ${path.basename(mapping.originalFilePath)}. Status: review pending.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error restoring bot proposal: ${error}`);
    }
  }

  /** Close any open bot diff session for this diagram (e.g. before Submit). */
  async cancelSessionsForOriginal(originalFilePath: string): Promise<void> {
    const n = path.normalize(originalFilePath);
    for (const s of [...this.sessionsByIncoming.values()]) {
      if (path.normalize(s.originalFilePath) === n) {
        await this.cleanupBotDiffSession(s);
      }
    }
  }

  /** `fileUri` must be the real workspace diagram file. */
  async showBotDiff(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.botReviewIntegration.getReviewMapping(path.normalize(fileUri.fsPath));
    if (!mapping) {
      vscode.window.showErrorMessage(
        "No active bot review for this file. Run MermaidChart: Review Bot Commits from the command palette."
      );
      return;
    }

    const existing = this.findSessionByOriginal(mapping.originalFilePath);
    if (existing) {
      await this.cleanupBotDiffSession(existing);
    }

    const id = crypto.randomBytes(8).toString("hex");
    const sessionDir = path.join(os.tmpdir(), "vscode-mermaid-chart-bot-review", id);
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
        Buffer.from(mapping.originalContent, "utf8")
      );
      await vscode.workspace.fs.writeFile(
        incomingTempUri,
        Buffer.from(mapping.botContent, "utf8")
      );
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create temp review files: ${e}`);
      return;
    }

    const diffTitle = `Bot review: ${path.basename(mapping.originalFilePath)}`;
    await vscode.commands.executeCommand("vscode.diff", originalTempUri, incomingTempUri, diffTitle, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });


    /** Let the diff editor attach before layout + webviews (same flow as repair / remote sync). */
    await new Promise<void>((r) => setTimeout(r, 280));

    let disposeDiagramPanels: (() => void) | undefined;
    try {
      disposeDiagramPanels = openDiagramDiffWebviews(mapping.originalContent, mapping.botContent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showWarningMessage(`Code diff opened, but diagram previews failed: ${msg}`);
    }

    const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (saved) => {
      if (!fileUrisMatch(saved.uri, incomingTempUri)) {
        return;
      }
      try {
        const text = saved.getText();
        await this.replaceOriginalFileContent(mapping.originalFilePath, text);
        mapping.botContent = text;
        mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "modified");
        this.botReviewIntegration.notifyReviewMappingsChanged();
      } catch (err) {
        vscode.window.showErrorMessage(`Could not save to diagram file: ${err}`);
      }
    });

    const session: BotDiffSession = {
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
              fileUrisMatch(original, originalTempUri) &&
              fileUrisMatch(modified, incomingTempUri)
            ) {
              void this.cleanupBotDiffSession(session);
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

  private findSessionByOriginal(originalFilePath: string): BotDiffSession | undefined {
    const n = path.normalize(originalFilePath);
    for (const s of this.sessionsByIncoming.values()) {
      if (path.normalize(s.originalFilePath) === n) {
        return s;
      }
    }
    return undefined;
  }

  private async replaceOriginalFileContent(originalFilePath: string, text: string): Promise<void> {
    const uri = vscode.Uri.file(originalFilePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, fullRange, text);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
    }
  }

  private async cleanupBotDiffSession(session: BotDiffSession): Promise<void> {
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
            "Bot review diff closed with unsaved changes on the right."
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
        session.mapping.botContent = contentToApply;
        session.mapping.status = "modified";
        this.fileDecorationProvider.updateFileStatus(session.mapping.originalFilePath, "modified");
        this.botReviewIntegration.notifyReviewMappingsChanged();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to apply changes on diff close: ${err}`);
      }
    }
  }

  async acceptBotChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.botReviewIntegration.getReviewMapping(path.normalize(fileUri.fsPath));
    if (!mapping) {
      return;
    }
    try {
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.botContent);
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "accepted");
      this.botReviewIntegration.notifyReviewMappingsChanged();
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `Bot changes applied to ${path.basename(mapping.originalFilePath)}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error accepting bot changes: ${error}`);
    }
  }

  async rejectBotChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.botReviewIntegration.getReviewMapping(path.normalize(fileUri.fsPath));
    if (!mapping) {
      return;
    }
    try {
      await this.replaceOriginalFileContent(mapping.originalFilePath, mapping.originalContent);
      this.fileDecorationProvider.updateFileStatus(mapping.originalFilePath, "rejected");
      this.botReviewIntegration.notifyReviewMappingsChanged();
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      const doc = await vscode.workspace.openTextDocument(mapping.originalFilePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `${path.basename(mapping.originalFilePath)}: restored to the version from before the bot update.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error rejecting bot changes: ${error}`);
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

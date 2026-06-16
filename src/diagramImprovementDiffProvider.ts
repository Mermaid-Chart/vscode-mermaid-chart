import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "node:os";
import { openDiagramDiffWebviews } from "./commercial/sync/diagramDiffView";

type ImprovementDiffSession = {
  originalFilePath: string;
  originalTempUri: vscode.Uri;
  incomingTempUri: vscode.Uri;
  incomingKey: string;
  disposeDiagramPanels: (() => void) | undefined;
  saveDisposable: vscode.Disposable;
  tabCloseDisposable: vscode.Disposable;
  cleaned: boolean;
};

/**
 * Same flow as app review / repair diff: temp base vs proposal, vscode.diff,
 * dual diagram previews, save right side → workspace diagram file.
 */
export class DiagramImprovementDiffProvider implements vscode.Disposable {
  private readonly sessionsByIncoming = new Map<string, ImprovementDiffSession>();

  async showImprovementDiff(
    originalFileUri: vscode.Uri,
    baseContent: string,
    proposedContent: string,
    improvementLabel: string
  ): Promise<void> {
    if (originalFileUri.scheme !== "file") {
      vscode.window.showErrorMessage("Improvement diff only works for saved diagram files on disk.");
      return;
    }

    const originalFilePath = originalFileUri.fsPath;
    const existing = this.findSessionByOriginal(originalFilePath);
    if (existing) {
      await this.cleanupSession(existing);
    }

    const id = crypto.randomBytes(8).toString("hex");
    const sessionDir = path.join(os.tmpdir(), "vscode-mermaid-chart-improvement", id);
    const sessionDirUri = vscode.Uri.file(sessionDir);
    try {
      await vscode.workspace.fs.createDirectory(sessionDirUri);
    } catch {
      /* exists */
    }

    const safeBase = path.basename(originalFilePath).replace(/[^a-zA-Z0-9._-]/g, "_");
    const originalTempUri = vscode.Uri.file(path.join(sessionDir, `${safeBase}.base.mmd`));
    const incomingTempUri = vscode.Uri.file(path.join(sessionDir, `${safeBase}.proposal.mmd`));
    const incomingKey = path.normalize(incomingTempUri.fsPath);

    try {
      await vscode.workspace.fs.writeFile(originalTempUri, Buffer.from(baseContent, "utf8"));
      await vscode.workspace.fs.writeFile(incomingTempUri, Buffer.from(proposedContent, "utf8"));
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create improvement diff files: ${e}`);
      return;
    }

    const diffTitle = `Improve: ${improvementLabel} — ${path.basename(originalFilePath)}`;
    await vscode.commands.executeCommand("vscode.diff", originalTempUri, incomingTempUri, diffTitle, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });

    await new Promise<void>((r) => setTimeout(r, 280));

    let disposeDiagramPanels: (() => void) | undefined;
    try {
      disposeDiagramPanels = openDiagramDiffWebviews(baseContent, proposedContent, {
        currentRepairDocumentUri: originalTempUri,
        incomingRepairDocumentUri: incomingTempUri,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showWarningMessage(`Code diff opened, but diagram previews failed: ${msg}`);
    }

    const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (saved) => {
      if (saved.uri.fsPath !== incomingTempUri.fsPath) {
        return;
      }
      try {
        await this.replaceOriginalFileContent(originalFilePath, saved.getText());
        vscode.window.showInformationMessage("Diagram updated from improvement diff.");
      } catch (err) {
        vscode.window.showErrorMessage(`Could not save diagram: ${err}`);
      }
    });

    const session: ImprovementDiffSession = {
      originalFilePath,
      originalTempUri,
      incomingTempUri,
      incomingKey,
      disposeDiagramPanels,
      saveDisposable,
      tabCloseDisposable: vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        for (const tab of closed) {
          if (tab.input instanceof vscode.TabInputTextDiff) {
            const { original, modified } = tab.input;
            if (
              original.fsPath === originalTempUri.fsPath &&
              modified.fsPath === incomingTempUri.fsPath
            ) {
              void this.cleanupSession(session);
              return;
            }
          }
        }
      }),
      cleaned: false,
    };

    this.sessionsByIncoming.set(incomingKey, session);

    vscode.window.showInformationMessage(
      "Edit the right side, then save (Ctrl+S) to apply to your diagram. Close the diff to discard temp files.",
      "OK"
    );
  }

  private findSessionByOriginal(originalFilePath: string): ImprovementDiffSession | undefined {
    for (const s of this.sessionsByIncoming.values()) {
      if (s.originalFilePath === originalFilePath) {
        return s;
      }
    }
    return undefined;
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
      /* disk write is enough */
    }
  }

  private async cleanupSession(session: ImprovementDiffSession): Promise<void> {
    if (session.cleaned) {
      return;
    }
    session.cleaned = true;
    this.sessionsByIncoming.delete(session.incomingKey);
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

  dispose(): void {
    for (const session of this.sessionsByIncoming.values()) {
      session.saveDisposable.dispose();
      session.tabCloseDisposable.dispose();
      session.disposeDiagramPanels?.();
    }
    this.sessionsByIncoming.clear();
  }
}

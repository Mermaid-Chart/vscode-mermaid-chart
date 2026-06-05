import * as vscode from "vscode";
import * as path from "path";
import { AppReviewIntegration, type ReviewFileMapping } from "./appReviewIntegration";
import type { AppReviewGitStatusTracker } from "./appReviewGitStatus";

export class AppReviewCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private readonly appReviewIntegration: AppReviewIntegration,
    private readonly gitStatusTracker: AppReviewGitStatusTracker
  ) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const mapping = this.appReviewIntegration.getReviewMapping(document.uri.fsPath);
    if (!mapping) {
      return [];
    }
    return this.buildCodeLenses(document.uri, mapping);
  }

  private appendReviewCodeLenses(
    top: vscode.Range,
    fileUri: vscode.Uri,
    mapping: ReviewFileMapping,
    lenses: vscode.CodeLens[],
    options: {
      includeReviewChanges: boolean;
      statusLabel?: { title: string; status: string };
    }
  ): void {
    if (options.includeReviewChanges) {
      lenses.push(
        new vscode.CodeLens(top, {
          title: "Review changes",
          command: "mermaidChart.openReviewFileDiff",
          arguments: [fileUri],
          tooltip: "Open diagram review (Now/Before, changes list, diff code)",
        })
      );
    }

    if (options.statusLabel) {
      lenses.push(
        new vscode.CodeLens(top, {
          title: options.statusLabel.title,
          command: "mermaidChart.showAppReviewStatus",
          arguments: [fileUri, options.statusLabel.status],
          tooltip: "Status details",
        })
      );
    }

    if (options.includeReviewChanges && mapping.status === "pending") {
      lenses.push(
        new vscode.CodeLens(top, {
          title: "Accept",
          command: "mermaidChart.appReviewAccept",
          arguments: [fileUri],
          tooltip: "Apply app sync version to this file",
        }),
        new vscode.CodeLens(top, {
          title: "Reject",
          command: "mermaidChart.appReviewReject",
          arguments: [fileUri],
          tooltip:
            "Put this file back to how it was before the Mermaid Sync app update",
        }),
      );
    }

    if (options.includeReviewChanges && mapping.status === "modified") {
      lenses.push(
        new vscode.CodeLens(top, {
          title: "Accept modified",
          command: "mermaidChart.acceptModifiedChanges",
          arguments: [fileUri],
          tooltip: "Mark outcome as accepted (file content unchanged)",
        }),
        new vscode.CodeLens(top, {
          title: "Reject & restore",
          command: "mermaidChart.appReviewBackToPending",
          arguments: [fileUri],
          tooltip: "Restore app proposal (incoming) and return to review",
        })
      );
    }

    if (mapping.status === "accepted" || mapping.status === "rejected") {
      lenses.push(
        new vscode.CodeLens(top, {
          title: "Back to review",
          command: "mermaidChart.appReviewBackToPending",
          arguments: [fileUri],
          tooltip: "Restore app proposal on disk and return to pending review",
        })
      );
    }

    if (this.gitStatusTracker.isDirtyForFile(fileUri.fsPath)) {
      lenses.push(
        new vscode.CodeLens(top, {
          title: "Commit changes",
          command: "mermaidChart.commitAppReview",
          arguments: [fileUri],
          tooltip: "git add and commit this file only",
        })
      );
    }

    lenses.push(
      new vscode.CodeLens(top, {
        title: "Close review",
        command: "mermaidChart.closeAppReview",
        arguments: [fileUri],
        tooltip: "Remove app review CodeLens for this file",
      })
    );
  }

  private buildCodeLenses(fileUri: vscode.Uri, mapping: ReviewFileMapping): vscode.CodeLens[] {
    const top = new vscode.Range(0, 0, 0, 0);
    const lenses: vscode.CodeLens[] = [];

    lenses.push(
      new vscode.CodeLens(top, {
        title: "Sync by Mermaid Diagram Sync",
        command: "mermaidChart.showAppSyncInfo",
        arguments: [fileUri],
        tooltip: "What this app review means for this file",
      })
    );

    if (mapping.status === "pending") {
      this.appendReviewCodeLenses(top, fileUri, mapping, lenses, { includeReviewChanges: true });
      return lenses;
    }

    if (mapping.status === "accepted") {
      this.appendReviewCodeLenses(top, fileUri, mapping, lenses, {
        includeReviewChanges: false,
        statusLabel: { title: "✅ Accepted", status: "accepted" },
      });
      return lenses;
    }

    if (mapping.status === "rejected") {
      this.appendReviewCodeLenses(top, fileUri, mapping, lenses, {
        includeReviewChanges: false,
        statusLabel: { title: "❌ Rejected", status: "rejected" },
      });
      return lenses;
    }

    this.appendReviewCodeLenses(top, fileUri, mapping, lenses, {
      includeReviewChanges: true,
      statusLabel: { title: "✏️ Modified", status: "modified" },
    });
    return lenses;
  }

  async showAppSyncInfo(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }

    const fileName = path.basename(fileUri.fsPath);

    void vscode.window.showInformationMessage(
      `"${fileName}" is in Mermaid Sync app review.\n\n` +
        "Review changes to see the app proposal and diagram preview.\n"
    );
  }

  async showAppReviewStatus(fileUri: vscode.Uri, status: string): Promise<void> {
    const fileName = path.basename(fileUri.fsPath);
    let message = "";
    let actions: string[] = [];

    switch (status) {
      case "accepted":
        message = `App changes are in "${fileName}". Commit when git shows local changes, or Close review to clear this file from the list.`;
        actions = ["OK"];
        break;
      case "rejected":
        message = `"${fileName}" was put back to the version from before the Mermaid Sync app update. Commit when git shows local changes, or Close review to clear this file from the list.`;
        actions = ["OK"];
        break;
      case "modified":
        message = `You have local edits for "${fileName}" after Mermaid Sync  app/review.`;
        actions = ["OK"];
        break;
    }

    if (message) {
      vscode.window.showInformationMessage(message, ...actions);
    }
  }

  async acceptModifiedChanges(fileUri: vscode.Uri): Promise<void> {
    const mapping = this.appReviewIntegration.getReviewMapping(fileUri.fsPath);
    if (!mapping) {
      return;
    }
    mapping.status = "accepted";
    this.appReviewIntegration.notifyReviewMappingsChanged();
    await this.gitStatusTracker.refreshPath(fileUri.fsPath);
    vscode.window.showInformationMessage(`Marked accepted for ${path.basename(fileUri.fsPath)}`);
  }

  async openAppReview(_fileUri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand("mermaidChart.reviewAppCommits");
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

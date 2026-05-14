import * as vscode from "vscode";
import * as path from "path";
import { BotReviewIntegration } from "./botReviewIntegration";
import { BotReviewGitStatusTracker } from "./botReviewGitStatus";
import { BotFileDecorationProvider } from "./botFileDecorationProvider";
import { BotDiffViewProvider } from "./botDiffViewProvider";
import { BotReviewCodeLensProvider } from "./botReviewCodeLensProvider";
import { BotCommitWorkflow } from "./botCommitWorkflow";

/**
 * Facade that owns all bot review sub-components and wires them together.
 * extension.ts calls `BotReviewFeature.register(context)` — nothing else.
 */
export class BotReviewFeature implements vscode.Disposable {
  private readonly integration: BotReviewIntegration;
  private readonly gitStatusTracker: BotReviewGitStatusTracker;
  private readonly fileDecorationProvider: BotFileDecorationProvider;
  private readonly diffViewProvider: BotDiffViewProvider;
  private readonly codeLensProvider: BotReviewCodeLensProvider;
  private readonly commitWorkflow: BotCommitWorkflow;

  constructor() {
    this.integration = new BotReviewIntegration();
    this.gitStatusTracker = new BotReviewGitStatusTracker(this.integration);
    this.fileDecorationProvider = new BotFileDecorationProvider(this.integration);
    this.diffViewProvider = new BotDiffViewProvider(this.integration, this.fileDecorationProvider);
    this.codeLensProvider = new BotReviewCodeLensProvider(this.integration, this.gitStatusTracker);
    this.commitWorkflow = new BotCommitWorkflow(this.integration, this.gitStatusTracker);
  }

  register(context: vscode.ExtensionContext): void {
    this.registerProviders(context);
    this.registerCommands(context);
    this.registerEventListeners(context);
    context.subscriptions.push(this);
  }

  private registerProviders(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.registerFileDecorationProvider(this.fileDecorationProvider)
    );

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
          [
            { language: "mermaid" },
            { pattern: new vscode.RelativePattern(workspaceFolder, "**/*.mmd") },
            { pattern: new vscode.RelativePattern(workspaceFolder, "**/*.mermaid") },
          ],
          this.codeLensProvider
        )
      );
    } else {
      context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: "mermaid" }, this.codeLensProvider)
      );
    }
  }

  private registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      // GitHub connection
      vscode.commands.registerCommand("mermaidChart.reviewBotCommits", () =>
        this.integration.reviewBotCommits()
      ),
      vscode.commands.registerCommand("mermaidChart.connectGitHub", () =>
        this.integration.connectGitHub()
      ),
      vscode.commands.registerCommand("mermaidChart.disconnectGitHub", () =>
        this.integration.disconnectGitHub()
      ),

      // CodeLens info actions
      vscode.commands.registerCommand("mermaidChart.showBotSyncInfo", (uri: vscode.Uri) =>
        this.codeLensProvider.showBotSyncInfo(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.showBotReviewStatus", (uri: vscode.Uri, status: string) =>
        this.codeLensProvider.showBotReviewStatus(uri, status)
      ),
      vscode.commands.registerCommand("mermaidChart.openBotReview", (uri: vscode.Uri) =>
        this.codeLensProvider.openBotReview(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.acceptModifiedChanges", (uri: vscode.Uri) =>
        this.codeLensProvider.acceptModifiedChanges(uri)
      ),

      // Diff view actions
      vscode.commands.registerCommand("mermaidChart.openReviewFileDiff", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.showBotDiff(target);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.botReviewAccept", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.acceptBotChanges(target);
          void this.gitStatusTracker.refreshPath(path.normalize(target.fsPath));
        }
      }),
      vscode.commands.registerCommand("mermaidChart.botReviewReject", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.rejectBotChanges(target);
          void this.gitStatusTracker.refreshPath(path.normalize(target.fsPath));
        }
      }),
      vscode.commands.registerCommand("mermaidChart.botReviewBackToPending", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.restoreBotProposalAndPending(target);
          void this.gitStatusTracker.refreshPath(path.normalize(target.fsPath));
        }
      }),

      // Commit workflow
      vscode.commands.registerCommand("mermaidChart.commitBotReview", (uri: vscode.Uri) =>
        this.commitWorkflow.commitBotReview(uri)
      ),

      // Close review
      vscode.commands.registerCommand("mermaidChart.submitBotReview", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          return;
        }
        const absolutePath = path.normalize(target.fsPath);
        await this.diffViewProvider.cancelSessionsForOriginal(absolutePath);
        const removed = this.integration.removeReviewForFile(absolutePath);
        this.gitStatusTracker.invalidatePath(absolutePath);
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        if (removed) {
          vscode.window.showInformationMessage("Review closed for this file.");
        } else {
          vscode.window.showWarningMessage("No active bot review for this file.");
        }
      })
    );
  }

  private registerEventListeners(context: vscode.ExtensionContext): void {
    // Refresh CodeLens whenever a reviewed file is saved or edited
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme !== "file") {
          return;
        }
        const filePath = path.normalize(doc.uri.fsPath);
        if (this.integration.getReviewMapping(filePath)) {
          void this.gitStatusTracker.refreshPath(filePath);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== "file") {
          return;
        }
        const filePath = path.normalize(e.document.uri.fsPath);
        if (this.integration.getReviewMapping(filePath)) {
          this.gitStatusTracker.scheduleRefreshPath(filePath);
        }
      })
    );

    // When git dirty state changes, refresh CodeLens buttons (shows/hides Commit)
    context.subscriptions.push(
      this.gitStatusTracker.onDidChangeDirty(() => {
        this.codeLensProvider.refresh();
      })
    );

    // When the review map changes (new files added, file removed), refresh all UI
    context.subscriptions.push(
      this.integration.onDidChangePendingReviews(() => {
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        void this.gitStatusTracker.refreshAllMapped();
      })
    );
  }

  dispose(): void {
    this.integration.dispose();
    this.gitStatusTracker.dispose();
    this.fileDecorationProvider.dispose();
    this.diffViewProvider.dispose();
    this.codeLensProvider.dispose();
  }
}

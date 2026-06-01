import * as vscode from "vscode";
import { AppReviewIntegration } from "./appReviewIntegration";
import { AppReviewGitStatusTracker } from "./appReviewGitStatus";
import { AppFileDecorationProvider } from "./appFileDecorationProvider";
import { AppDiffViewProvider } from "./appDiffViewProvider";
import { AppReviewCodeLensProvider } from "./appReviewCodeLensProvider";
import { AppCommitWorkflow } from "./appCommitWorkflow";
import { AppReviewGitPullWatcher } from "./appReviewGitPullWatcher";

/**
 * Facade that owns all app review sub-components and wires them together.
 * extension.ts calls `AppReviewFeature.register(context)` — nothing else.
 */
export class AppReviewFeature implements vscode.Disposable {
  private readonly integration: AppReviewIntegration;
  private readonly gitStatusTracker: AppReviewGitStatusTracker;
  private readonly fileDecorationProvider: AppFileDecorationProvider;
  private readonly diffViewProvider: AppDiffViewProvider;
  private readonly codeLensProvider: AppReviewCodeLensProvider;
  private readonly commitWorkflow: AppCommitWorkflow;
  private readonly gitPullWatcher: AppReviewGitPullWatcher;

  constructor() {
    this.integration = new AppReviewIntegration();
    this.gitStatusTracker = new AppReviewGitStatusTracker(this.integration);
    this.fileDecorationProvider = new AppFileDecorationProvider(this.integration);
    this.diffViewProvider = new AppDiffViewProvider(this.integration, this.fileDecorationProvider);
    this.codeLensProvider = new AppReviewCodeLensProvider(this.integration, this.gitStatusTracker);
    this.commitWorkflow = new AppCommitWorkflow(this.integration, this.gitStatusTracker);
    this.gitPullWatcher = new AppReviewGitPullWatcher(this.integration);
  }

  register(context: vscode.ExtensionContext): void {
    this.registerProviders(context);
    this.registerCommands(context);
    this.registerEventListeners(context);
    this.gitPullWatcher.start(context);
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
      vscode.commands.registerCommand("mermaidChart.reviewAppCommits", () =>
        this.integration.reviewAppCommits()
      ),
      vscode.commands.registerCommand("mermaidChart.connectGitHub", () =>
        this.integration.connectGitHub()
      ),
      vscode.commands.registerCommand("mermaidChart.disconnectGitHub", () =>
        this.integration.disconnectGitHub()
      ),
      vscode.commands.registerCommand("mermaidChart.showAppSyncInfo", (uri: vscode.Uri) =>
        this.codeLensProvider.showAppSyncInfo(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.showAppReviewStatus", (uri: vscode.Uri, status: string) =>
        this.codeLensProvider.showAppReviewStatus(uri, status)
      ),
      vscode.commands.registerCommand("mermaidChart.openAppReview", (uri: vscode.Uri) =>
        this.codeLensProvider.openAppReview(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.acceptModifiedChanges", (uri: vscode.Uri) =>
        this.codeLensProvider.acceptModifiedChanges(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.openReviewFileDiff", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.showAppDiff(target);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewAccept", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.acceptAppChanges(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewReject", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.rejectAppChanges(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewBackToPending", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) {
          await this.diffViewProvider.restoreAppProposalAndPending(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.commitAppReview", (uri: vscode.Uri) =>
        this.commitWorkflow.commitAppReview(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.closeAppReview", async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          return;
        }
        const absolutePath = target.fsPath;
        await this.diffViewProvider.cancelSessionsForOriginal(absolutePath);
        const removed = this.integration.removeReviewForFile(absolutePath);
        this.gitStatusTracker.invalidatePath(absolutePath);
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        if (removed) {
          vscode.window.showInformationMessage("Review closed for this file.");
        } else {
          vscode.window.showWarningMessage("No active app review for this file.");
        }
      })
    );
  }

  private registerEventListeners(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme !== "file") {
          return;
        }
        const filePath = doc.uri.fsPath;
        if (this.integration.getReviewMapping(filePath)) {
          void this.gitStatusTracker.refreshPath(filePath);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== "file") {
          return;
        }
        const filePath = e.document.uri.fsPath;
        if (this.integration.getReviewMapping(filePath)) {
          this.gitStatusTracker.scheduleRefreshPath(filePath);
        }
      })
    );

    context.subscriptions.push(
      this.gitStatusTracker.onDidChangeDirty(() => {
        this.codeLensProvider.refresh();
      })
    );

    context.subscriptions.push(
      this.integration.onDidChangePendingReviews(() => {
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        void this.gitStatusTracker.refreshAllMapped();
      })
    );
  }

  dispose(): void {
    this.gitPullWatcher.dispose();
    this.integration.dispose();
    this.gitStatusTracker.dispose();
    this.fileDecorationProvider.dispose();
    this.diffViewProvider.dispose();
    this.codeLensProvider.dispose();
  }
}

import * as vscode from "vscode";
import { AppReviewIntegration } from "./appReviewIntegration";
import { AppReviewGitStatusTracker } from "./appReviewGitStatus";
import { AppFileDecorationProvider } from "./appFileDecorationProvider";
import { AppDiffViewProvider } from "./appDiffViewProvider";
import { AppReviewCodeLensProvider } from "./appReviewCodeLensProvider";
import { AppCommitWorkflow } from "./appCommitWorkflow";
import { AppReviewGitPullWatcher } from "./appReviewGitPullWatcher";
import { ReviewMermaidSyncTreeProvider } from "./reviewMermaidSyncTreeProvider";
import { MermaidChartAuthenticationProvider } from "./mermaidChartAuthenticationProvider";
import { AppReviewScmSync, resolveReviewCommandTarget } from "./appReviewScmSync";
import analytics from "./analytics";

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
  private readonly reviewSyncTree: ReviewMermaidSyncTreeProvider;
  private readonly reviewScmSync: AppReviewScmSync;

  constructor() {
    this.integration = new AppReviewIntegration();
    this.reviewScmSync = new AppReviewScmSync(this.integration);
    this.gitStatusTracker = new AppReviewGitStatusTracker(this.integration);
    this.fileDecorationProvider = new AppFileDecorationProvider(this.integration);
    this.diffViewProvider = new AppDiffViewProvider(this.integration, this.fileDecorationProvider);
    this.codeLensProvider = new AppReviewCodeLensProvider(this.integration, this.gitStatusTracker);
    this.commitWorkflow = new AppCommitWorkflow(this.integration, this.gitStatusTracker);
    this.reviewSyncTree = new ReviewMermaidSyncTreeProvider(this.integration);
    this.gitPullWatcher = new AppReviewGitPullWatcher(this.integration, (count) =>
      this.focusReviewSyncPanel(count),
    );
  }

  private resolveReviewTarget(
    arg?: vscode.Uri | vscode.TreeItem | vscode.SourceControlResourceState,
  ): vscode.Uri | undefined {
    return (
      resolveReviewCommandTarget(arg) ??
      resolveReviewCommandTarget(vscode.window.activeTextEditor?.document.uri)
    );
  }

  private refreshReviewScmIfOpen(): void {
    this.reviewScmSync.refreshIfActive();
  }

  register(context: vscode.ExtensionContext): void {
    this.reviewSyncTree.register(context);
    this.registerProviders(context);
    this.registerCommands(context);
    this.registerEventListeners(context);
    context.subscriptions.push(this.reviewScmSync);
    this.gitPullWatcher.start(context);
  }

  private async focusReviewSyncPanel(registeredCount: number): Promise<void> {
    if (registeredCount <= 0) {
      return;
    }
    await this.reviewSyncTree.focusView();
  }

  private async ensureMermaidLogin(): Promise<boolean> {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true },
    );
    if (session) {
      return true;
    }

    const pick = await vscode.window.showInformationMessage(
      "Sign in to Mermaid Chart to use Review Mermaid Sync actions.",
      { modal: true },
      "Sign in",
    );
    if (pick !== "Sign in") {
      return false;
    }

    await vscode.commands.executeCommand("mermaidChart.login");
    const afterLogin = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true },
    );
    return !!afterLogin;
  }

  private async acceptAllInReview(): Promise<void> {
    if (!(await this.ensureMermaidLogin())) {
      return;
    }

    const all = [...this.integration.getReviewMappings().values()];
    if (all.length === 0) {
      vscode.window.showInformationMessage("No diagrams in review.");
      return;
    }

    let accepted = 0;
    let failed = 0;
    for (const mapping of all) {
      const ok = await this.diffViewProvider.acceptAppChanges(
        vscode.Uri.file(mapping.originalFilePath),
        { silent: true, notify: false },
      );
      if (ok) {
        accepted++;
      } else {
        failed++;
      }
    }

    this.integration.notifyReviewMappingsChanged();
    if (accepted > 0) {
      analytics.trackReviewSyncAcceptAll();
      vscode.window.showInformationMessage(
        `Accepted Mermaid Sync changes for ${accepted} diagram file(s).`,
      );
    }
    if (failed > 0) {
      vscode.window.showErrorMessage(
        `Could not accept Mermaid Sync changes for ${failed} diagram file(s).`,
      );
    }
    this.reviewSyncTree.refresh();
  }

  private async rejectAllInReview(): Promise<void> {
    if (!(await this.ensureMermaidLogin())) {
      return;
    }

    const all = [...this.integration.getReviewMappings().values()];
    if (all.length === 0) {
      vscode.window.showInformationMessage("No diagrams in review.");
      return;
    }

    let rejected = 0;
    let failed = 0;
    for (const mapping of all) {
      const ok = await this.diffViewProvider.rejectAppChanges(
        vscode.Uri.file(mapping.originalFilePath),
        { silent: true, notify: false },
      );
      if (ok) {
        rejected++;
      } else {
        failed++;
      }
    }

    this.integration.notifyReviewMappingsChanged();
    if (rejected > 0) {
      analytics.trackReviewSyncRejectAll();
      vscode.window.showInformationMessage(
        `Rejected Mermaid Sync changes for ${rejected} diagram file(s).`,
      );
    }
    if (failed > 0) {
      vscode.window.showErrorMessage(
        `Could not reject Mermaid Sync changes for ${failed} diagram file(s).`,
      );
    }
    this.reviewSyncTree.refresh();
  }

  private async openChangesInReview(): Promise<void> {
    if (!(await this.ensureMermaidLogin())) {
      return;
    }

    if (this.integration.getReviewMappings().size === 0) {
      vscode.window.showInformationMessage("No diagrams in review.");
      return;
    }

    await this.diffViewProvider.openAllReviewChanges({
      multiDiffSourceUri: this.reviewScmSync.ensureForMultiDiff(),
      onMultiDiffClosed: () => this.reviewScmSync.releaseMultiDiff(),
    });
    analytics.trackReviewSyncOpenChanges();
  }

  private async closeAllInReview(): Promise<void> {
    if (!(await this.ensureMermaidLogin())) {
      return;
    }

    const mappings = [...this.integration.getReviewMappings().values()];
    if (mappings.length === 0) {
      vscode.window.showInformationMessage("No active review session.");
      return;
    }

    for (const mapping of mappings) {
      await this.diffViewProvider.cancelSessionsForOriginal(mapping.originalFilePath);
      this.gitStatusTracker.invalidatePath(mapping.originalFilePath);
    }

    await this.diffViewProvider.cleanupMultiDiffSession();
    this.reviewScmSync.releaseMultiDiff();

    const count = this.integration.clearAllReviews();
    this.fileDecorationProvider.refresh();
    this.codeLensProvider.refresh();
    this.reviewSyncTree.refresh();

    if (count > 0) {
      vscode.window.showInformationMessage(`Closed Mermaid Sync review for ${count} diagram file(s).`);
    }
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
      vscode.commands.registerCommand("mermaidChart.reviewAppCommits", async () => {
        const count = await this.integration.reviewAppCommits();
        await this.focusReviewSyncPanel(count);
      }),
      vscode.commands.registerCommand("mermaidChart.reviewSyncOpenChanges", () =>
        this.openChangesInReview(),
      ),
      vscode.commands.registerCommand("mermaidChart.reviewSyncAcceptAll", () =>
        this.acceptAllInReview(),
      ),
      vscode.commands.registerCommand("mermaidChart.reviewSyncRejectAll", () =>
        this.rejectAllInReview(),
      ),
      vscode.commands.registerCommand("mermaidChart.reviewSyncCloseAll", () =>
        this.closeAllInReview(),
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
      vscode.commands.registerCommand("mermaidChart.openReviewFileDiff", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (!target) {
          vscode.window.showWarningMessage("Open a diagram file (.mmd) to review changes.");
          return;
        }
        await this.diffViewProvider.showAppDiff(target);
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewAccept", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          await this.diffViewProvider.acceptAppChanges(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewReject", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          await this.diffViewProvider.rejectAppChanges(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.appReviewBackToPending", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          await this.diffViewProvider.restoreAppProposalAndPending(target);
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      vscode.commands.registerCommand("mermaidChart.commitAppReview", (uri: vscode.Uri) =>
        this.commitWorkflow.commitAppReview(uri)
      ),
      vscode.commands.registerCommand("mermaidChart.closeAppReview", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (!target) {
          return;
        }
        const absolutePath = target.fsPath;
        await this.diffViewProvider.cancelSessionsForOriginal(absolutePath);
        const removed = this.integration.removeReviewForFile(absolutePath);
        this.gitStatusTracker.invalidatePath(absolutePath);
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        this.reviewSyncTree.refresh();
        this.refreshReviewScmIfOpen();
        if (removed) {
          vscode.window.showInformationMessage("Review closed for this file.");
        } else {
          vscode.window.showWarningMessage("No active app review for this file.");
        }
      }),
      vscode.commands.registerCommand("mermaidChart.focusReviewMermaidSync", async () => {
        await this.reviewSyncTree.focusView();
      }),
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
        this.reviewSyncTree.refresh();
        this.refreshReviewScmIfOpen();
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
    this.reviewSyncTree.dispose();
    this.reviewScmSync.dispose();
  }
}

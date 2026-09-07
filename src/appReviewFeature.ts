import * as vscode from "vscode";
import { AppReviewIntegration, type ReviewFileMapping } from "./appReviewIntegration";
import { reviewOriginWording } from "./appReviewStatus";
import { AppReviewGitStatusTracker } from "./appReviewGitStatus";
import { AppFileDecorationProvider } from "./appFileDecorationProvider";
import { AppDiffViewProvider } from "./appDiffViewProvider";
import { AppReviewCodeLensProvider } from "./appReviewCodeLensProvider";
import { AppCommitWorkflow } from "./appCommitWorkflow";
import { AppReviewGitPullWatcher } from "./appReviewGitPullWatcher";
import { ReviewMermaidSyncTreeProvider } from "./reviewMermaidSyncTreeProvider";
import { registerAuthenticatedCommand } from "./loginTrigger";
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

  /** Files in the review session — Event 7 `fileCount`. Read before an action mutates the list. */
  private reviewFileCount(): number {
    return this.integration.getReviewMappings().size;
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

  /** Pre-commit / local regen → same Review Mermaid Sync list as GitHub app review. */
  async registerLocalProposalsAndFocus(
    items: Array<{
      relativePath: string;
      originalFilePath: string;
      originalContent: string;
      proposedContent: string;
    }>,
    options?: { clearExisting?: boolean; gitRoot?: string },
  ): Promise<number> {
    const count = this.integration.registerLocalReviewProposals(items, options);
    await this.focusReviewSyncPanel(count);
    return count;
  }

  /** Bulk toasts: local wording only when every file in review came from local regenerate. */
  private wordingFor(mappings: ReviewFileMapping[]): ReturnType<typeof reviewOriginWording> {
    return reviewOriginWording(
      mappings.every((m) => m.origin === "local") ? "local" : "app",
    );
  }

  private async acceptAllInReview(): Promise<void> {
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

    const wording = this.wordingFor(all);
    this.integration.notifyReviewMappingsChanged();
    analytics.trackReviewAction({
      reviewAction: "accept",
      scope: "all",
      fileCount: all.length,
      status: failed > 0 ? "error" : "success",
      errorType: failed > 0 ? "acceptFailed" : undefined,
    });
    if (accepted > 0) {
      vscode.window.showInformationMessage(
        `Accepted ${wording.source} changes for ${accepted} diagram file(s).`,
      );
    }
    if (failed > 0) {
      vscode.window.showErrorMessage(
        `Could not accept ${wording.source} changes for ${failed} diagram file(s).`,
      );
    }
    this.reviewSyncTree.refresh();
  }

  private async rejectAllInReview(): Promise<void> {
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

    const wording = this.wordingFor(all);
    this.integration.notifyReviewMappingsChanged();
    analytics.trackReviewAction({
      reviewAction: "reject",
      scope: "all",
      fileCount: all.length,
      status: failed > 0 ? "error" : "success",
      errorType: failed > 0 ? "rejectFailed" : undefined,
    });
    if (rejected > 0) {
      vscode.window.showInformationMessage(
        `Rejected ${wording.source} changes for ${rejected} diagram file(s).`,
      );
    }
    if (failed > 0) {
      vscode.window.showErrorMessage(
        `Could not reject ${wording.source} changes for ${failed} diagram file(s).`,
      );
    }
    this.reviewSyncTree.refresh();
  }

  private async openChangesInReview(): Promise<void> {
    const fileCount = this.reviewFileCount();
    if (fileCount === 0) {
      vscode.window.showInformationMessage("No diagrams in review.");
      return;
    }

    await this.diffViewProvider.openAllReviewChanges({
      multiDiffSourceUri: this.reviewScmSync.ensureForMultiDiff(),
      onMultiDiffClosed: () => this.reviewScmSync.releaseMultiDiff(),
    });
    analytics.trackReviewAction({
      reviewAction: "openChanges",
      scope: "all",
      fileCount,
      status: "success",
    });
  }

  private async closeAllInReview(): Promise<void> {
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
      analytics.trackReviewAction({
        reviewAction: "closeReview",
        scope: "all",
        fileCount: mappings.length,
        status: "success",
      });
      vscode.window.showInformationMessage(
        `Closed ${this.wordingFor(mappings).source} review for ${count} diagram file(s).`,
      );
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
      registerAuthenticatedCommand("mermaidChart.reviewAppCommits", async () => {
        const count = await this.integration.reviewAppCommits();
        await this.focusReviewSyncPanel(count);
      }),
      // Internal plumbing, invoked by StagingSyncService — must never prompt.
      vscode.commands.registerCommand(
        "mermaidChart.diagramReviewCount",
        () => this.integration.getReviewMappings().size,
      ),
      vscode.commands.registerCommand(
        "mermaidChart.registerLocalDiagramReviews",
        (
          items: Array<{
            relativePath: string;
            originalFilePath: string;
            originalContent: string;
            proposedContent: string;
          }>,
          options?: { clearExisting?: boolean; gitRoot?: string },
        ) => this.registerLocalProposalsAndFocus(items, options),
      ),
      registerAuthenticatedCommand("mermaidChart.reviewSyncOpenChanges", () =>
        this.openChangesInReview(),
      ),
      registerAuthenticatedCommand("mermaidChart.reviewSyncAcceptAll", () =>
        this.acceptAllInReview(),
      ),
      registerAuthenticatedCommand("mermaidChart.reviewSyncRejectAll", () =>
        this.rejectAllInReview(),
      ),
      registerAuthenticatedCommand("mermaidChart.reviewSyncCloseAll", () =>
        this.closeAllInReview(),
      ),
      registerAuthenticatedCommand("mermaidChart.connectGitHub", () =>
        this.integration.connectGitHub()
      ),
      registerAuthenticatedCommand("mermaidChart.disconnectGitHub", () =>
        this.integration.disconnectGitHub()
      ),
      registerAuthenticatedCommand("mermaidChart.showAppSyncInfo", (uri: vscode.Uri) =>
        this.codeLensProvider.showAppSyncInfo(uri)
      ),
      registerAuthenticatedCommand("mermaidChart.showAppReviewStatus", (uri: vscode.Uri, status: string) =>
        this.codeLensProvider.showAppReviewStatus(uri, status)
      ),
      registerAuthenticatedCommand("mermaidChart.openAppReview", (uri: vscode.Uri) =>
        this.codeLensProvider.openAppReview(uri)
      ),
      registerAuthenticatedCommand("mermaidChart.acceptModifiedChanges", (uri: vscode.Uri) =>
        this.codeLensProvider.acceptModifiedChanges(uri)
      ),
      registerAuthenticatedCommand("mermaidChart.openReviewFileDiff", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (!target) {
          vscode.window.showWarningMessage("Open a diagram file (.mmd) to review changes.");
          return;
        }
        const fileCount = this.reviewFileCount();
        analytics.trackReviewAction({
          reviewAction: "openReviewUI",
          scope: "file",
          fileCount,
          status: "success",
        });
        await this.diffViewProvider.showAppDiff(target);
      }),
      registerAuthenticatedCommand("mermaidChart.appReviewAccept", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          const fileCount = this.reviewFileCount();
          const accepted = await this.diffViewProvider.acceptAppChanges(target);
          analytics.trackReviewAction({
            reviewAction: "accept",
            scope: "file",
            fileCount,
            status: accepted ? "success" : "error",
            errorType: accepted ? undefined : "acceptFailed",
          });
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      registerAuthenticatedCommand("mermaidChart.appReviewReject", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          const fileCount = this.reviewFileCount();
          const rejected = await this.diffViewProvider.rejectAppChanges(target);
          analytics.trackReviewAction({
            reviewAction: "reject",
            scope: "file",
            fileCount,
            status: rejected ? "success" : "error",
            errorType: rejected ? undefined : "rejectFailed",
          });
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      registerAuthenticatedCommand("mermaidChart.appReviewBackToPending", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (target) {
          const fileCount = this.reviewFileCount();
          const restored = await this.diffViewProvider.restoreAppProposalAndPending(target);
          analytics.trackReviewAction({
            reviewAction: "returnToReview",
            scope: "file",
            fileCount,
            status: restored ? "success" : "error",
            errorType: restored ? undefined : "restoreFailed",
          });
          await this.gitStatusTracker.refreshPath(target.fsPath);
        }
      }),
      registerAuthenticatedCommand("mermaidChart.commitAppReview", async (uri: vscode.Uri) => {
        const fileCount = this.reviewFileCount();
        const outcome = await this.commitWorkflow.commitAppReview(uri);
        analytics.trackReviewAction({
          reviewAction: "commit",
          scope: "file",
          fileCount,
          status: outcome === "error" ? "error" : outcome,
          errorType: outcome === "error" ? "gitError" : undefined,
        });
      }),
      registerAuthenticatedCommand("mermaidChart.closeAppReview", async (arg) => {
        const target = this.resolveReviewTarget(arg);
        if (!target) {
          return;
        }
        const absolutePath = target.fsPath;
        const fileCount = this.reviewFileCount();
        await this.diffViewProvider.cancelSessionsForOriginal(absolutePath);
        const removed = this.integration.removeReviewForFile(absolutePath);
        this.gitStatusTracker.invalidatePath(absolutePath);
        this.fileDecorationProvider.refresh();
        this.codeLensProvider.refresh();
        this.reviewSyncTree.refresh();
        this.refreshReviewScmIfOpen();
        if (removed) {
          analytics.trackReviewAction({
            reviewAction: "closeReview",
            scope: "file",
            fileCount,
            status: "success",
          });
          vscode.window.showInformationMessage("Review closed for this file.");
        } else {
          vscode.window.showWarningMessage("No active app review for this file.");
        }
      }),
      registerAuthenticatedCommand("mermaidChart.focusReviewMermaidSync", async () => {
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

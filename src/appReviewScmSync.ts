import * as vscode from "vscode";
import type { AppReviewIntegration, ReviewFileMapping } from "./appReviewIntegration";
import { resolveReviewDiagramUri, reviewStatusDecoration } from "./appReviewStatus";

/** SCM id — must match `when`: scmProvider == mermaidSyncReview in package.json */
export const MERMAID_SYNC_REVIEW_SCM_ID = "mermaidSyncReview";

/**
 * Lightweight hidden SCM bridge used only while the Open Changes multi-diff tab is open.
 * VS Code needs an SCM provider for per-row Accept / Reject in that editor.
 * `isHidden` (scmProviderOptions) keeps it out of the Source Control sidebar UI.
 */
export class AppReviewScmSync implements vscode.Disposable {
  private scm?: vscode.SourceControl;
  private resourceGroup?: vscode.SourceControlResourceGroup;

  constructor(private readonly integration: AppReviewIntegration) {}

  /** Register SCM + sync files; call right before opening Open Changes. */
  ensureForMultiDiff(): vscode.Uri | undefined {
    const mappings = [...this.integration.getReviewMappings().values()].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );
    if (mappings.length === 0) {
      this.releaseMultiDiff();
      return undefined;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!this.scm) {
      this.scm = vscode.scm.createSourceControl(
        MERMAID_SYNC_REVIEW_SCM_ID,
        "Mermaid Sync Review",
        root,
        undefined,
        true,
      );
      this.scm.inputBox.visible = false;
      this.resourceGroup = this.scm.createResourceGroup("changes", "Changes");
      this.resourceGroup.hideWhenEmpty = true;
    }

    this.applyResourceStates(mappings);
    return vscode.Uri.from({ scheme: "scm-multi-diff", path: MERMAID_SYNC_REVIEW_SCM_ID });
  }

  /** Keep Open Changes row actions in sync when a file is accepted/rejected while the tab is open. */
  refreshIfActive(): void {
    if (!this.scm) {
      return;
    }
    const mappings = [...this.integration.getReviewMappings().values()].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );
    if (mappings.length === 0) {
      this.releaseMultiDiff();
      return;
    }
    this.applyResourceStates(mappings);
  }

  /** Tear down SCM when Open Changes closes — removes the extra list from Source Control. */
  releaseMultiDiff(): void {
    this.disposeScm();
  }

  private applyResourceStates(mappings: ReviewFileMapping[]): void {
    this.resourceGroup!.resourceStates = mappings.map((mapping) => {
      const status = reviewStatusDecoration(mapping.status);
      return {
        resourceUri: vscode.Uri.file(mapping.originalFilePath),
        contextValue: "mermaidReviewSyncFile",
        decorations: {
          strikeThrough: false,
          tooltip: `${mapping.relativePath} (${status.label})`,
          icon: undefined,
          letter: status.badge,
          color: status.color,
        },
      };
    });
    this.scm!.count = mappings.length;
  }

  private disposeScm(): void {
    this.scm?.dispose();
    this.scm = undefined;
    this.resourceGroup = undefined;
  }

  dispose(): void {
    this.disposeScm();
  }
}

export function resolveReviewCommandTarget(
  arg?: vscode.Uri | vscode.TreeItem | vscode.SourceControlResourceState,
): vscode.Uri | undefined {
  if (!arg) {
    return undefined;
  }

  if (arg instanceof vscode.Uri) {
    return resolveReviewDiagramUri(arg);
  }

  const resourceUri =
    arg instanceof vscode.TreeItem
      ? arg.resourceUri
      : "resourceUri" in arg && arg.resourceUri instanceof vscode.Uri
        ? arg.resourceUri
        : undefined;

  return resourceUri ? resolveReviewDiagramUri(resourceUri) : undefined;
}

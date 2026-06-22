import * as path from "path";
import * as vscode from "vscode";
import type { AppReviewIntegration } from "./appReviewIntegration";
import { toReviewTreeUri } from "./appReviewStatus";

export class ReviewMermaidSyncTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeView?: vscode.TreeView<vscode.TreeItem>;

  constructor(private readonly integration: AppReviewIntegration) {}

  register(context: vscode.ExtensionContext): vscode.TreeView<vscode.TreeItem> {
    this.treeView = vscode.window.createTreeView("mermaidReviewSync", {
      treeDataProvider: this,
      showCollapseAll: false,
    });
    context.subscriptions.push(this.treeView, this);
    return this.treeView;
  }

  refresh(): void {
    this.updateVisibilityContext();
    this.updateTitle();
    this._onDidChangeTreeData.fire(undefined);
  }

  async focusView(): Promise<void> {
    this.refresh();
    await vscode.commands.executeCommand("workbench.view.extension.mermaidActivityBar");
    await vscode.commands.executeCommand("mermaidReviewSync.focus");
  }

  private updateVisibilityContext(): void {
    const hasItems = this.integration.getReviewMappings().size > 0;
    void vscode.commands.executeCommand("setContext", "mermaid.hasAppReviewSync", hasItems);
  }

  private updateTitle(): void {
    if (!this.treeView) {
      return;
    }
    const mappings = [...this.integration.getReviewMappings().values()];
    const pending = mappings.filter((m) => m.status === "pending").length;
    if (mappings.length === 0) {
      this.treeView.title = "Review Mermaid Sync";
      return;
    }
    this.treeView.title =
      pending > 0
        ? `Review Mermaid Sync (${mappings.length} · ${pending} pending)`
        : `Review Mermaid Sync (${mappings.length})`;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const mappings = [...this.integration.getReviewMappings().values()].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );

    return mappings.map((mapping) => {
      const fileUri = vscode.Uri.file(mapping.originalFilePath);
      const item = new vscode.TreeItem(
        path.basename(mapping.originalFilePath),
        vscode.TreeItemCollapsibleState.None,
      );
      // Custom scheme: our R/A/M badges only — Git must not add M for working-tree changes.
      item.resourceUri = toReviewTreeUri(mapping.originalFilePath);
      item.tooltip = mapping.relativePath;
      item.command = {
        command: "vscode.open",
        title: "Open Diagram",
        arguments: [fileUri, { preview: false, viewColumn: vscode.ViewColumn.Active }],
      };
      item.contextValue = "mermaidReviewSyncFile";
      return item;
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

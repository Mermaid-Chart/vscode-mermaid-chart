import * as vscode from 'vscode';
import { MermaidChartVSCode } from './mermaidChartVSCode';
import { MermaidChartProvider, MCTreeItem, Document, getDiagramFromCache, updateDiagramInCache, getProjectIdForDocument, getAllTreeViewProjectsCache } from './mermaidChartProvider';

/**
 * Handles diagram management operations like rename and delete
 */
export class DiagramManager {
  private mcAPI: MermaidChartVSCode;
  private provider: MermaidChartProvider;

  constructor(mcAPI: MermaidChartVSCode, provider: MermaidChartProvider) {
    this.mcAPI = mcAPI;
    this.provider = provider;
  }

  /**
   * Rename a diagram both locally and on Mermaid Chart
   */
  public async renameDiagram(item: MCTreeItem): Promise<void> {
    if (!(item instanceof Document)) {
      vscode.window.showErrorMessage('Only diagrams can be renamed.');
      return;
    }

    const currentTitle = item.title;
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new diagram name',
      value: currentTitle,
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Diagram name cannot be empty';
        }
        if (value.length > 100) {
          return 'Diagram name cannot exceed 100 characters';
        }
        return null;
      }
    });

    if (!newTitle || newTitle.trim() === currentTitle) {
      return; // User cancelled or didn't change the name
    }

    try {
      // Show progress indicator
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Renaming diagram...",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: `Renaming "${currentTitle}" to "${newTitle.trim()}"` });

        // Get the project ID for this diagram
        const projectId = getProjectIdForDocument(item.uuid);
        if (!projectId) {
          throw new Error('Could not find project for this diagram');
        }

        // First, get the existing document to preserve its content
        const existingDocument = await this.mcAPI.getDocument({
          documentID: item.uuid
        });

        // Update the diagram title on Mermaid Chart while preserving the existing code
        await this.mcAPI.setDocument({
          documentID: item.uuid,
          projectID: projectId,
          title: newTitle.trim(),
          code: existingDocument.code // Preserve the existing code
        });

        // Update local cache
        const cachedDiagram = getDiagramFromCache(item.uuid);
        if (cachedDiagram) {
          cachedDiagram.title = newTitle.trim();
        }

        // Refresh the tree view
        this.provider.refresh();

        vscode.window.showInformationMessage(`Diagram renamed to "${newTitle.trim()}" successfully.`);
      });
    } catch (error: any) {
      console.error('Error renaming diagram:', error);
      vscode.window.showErrorMessage(`Failed to rename diagram: ${error.message || error}`);
    }
  }

  /**
   * Delete a diagram both locally and from Mermaid Chart
   */
  public async deleteDiagram(item: MCTreeItem): Promise<void> {
    if (!(item instanceof Document)) {
      vscode.window.showErrorMessage('Only diagrams can be deleted.');
      return;
    }

    const diagramTitle = item.title;
    
    // Confirm deletion with user
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the diagram "${diagramTitle}"? This action cannot be undone.`,
      { modal: true },
      'Delete',
      'Cancel'
    );

    if (confirmation !== 'Delete') {
      return;
    }

    try {
      // Show progress indicator
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Deleting diagram...",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: `Deleting "${diagramTitle}"` });

        // Delete from Mermaid Chart
        await this.mcAPI.deleteDocument(item.uuid);

        // Remove from local cache by refreshing from server
        // This ensures consistency with the server state
        await this.provider.syncMermaidChart();

        vscode.window.showInformationMessage(`Diagram "${diagramTitle}" deleted successfully.`);
      });
    } catch (error: any) {
      console.error('Error deleting diagram:', error);
      vscode.window.showErrorMessage(`Failed to delete diagram: ${error.message || error}`);
    }
  }

  /**
   * Register the diagram management commands
   */
  public static registerCommands(
    context: vscode.ExtensionContext,
    mcAPI: MermaidChartVSCode,
    provider: MermaidChartProvider
  ): void {
    const diagramManager = new DiagramManager(mcAPI, provider);

    // Register rename command
    const renameCommand = vscode.commands.registerCommand(
      'mermaidChart.renameDiagram',
      async (item: MCTreeItem) => {
        await diagramManager.renameDiagram(item);
      }
    );
    context.subscriptions.push(renameCommand);

    // Register delete command
    const deleteCommand = vscode.commands.registerCommand(
      'mermaidChart.deleteDiagram',
      async (item: MCTreeItem) => {
        await diagramManager.deleteDiagram(item);
      }
    );
    context.subscriptions.push(deleteCommand);
  }
}
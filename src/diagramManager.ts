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
   * Duplicate a diagram in the same project with a numbered suffix
   */
  public async duplicateDiagram(item: MCTreeItem): Promise<void> {
    if (!(item instanceof Document)) {
      vscode.window.showErrorMessage('Only diagrams can be duplicated.');
      return;
    }

    const originalTitle = item.title;

    try {
      // Show progress indicator
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Duplicating diagram...",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: `Duplicating "${originalTitle}"` });

        // Get the project ID for this diagram
        const projectId = getProjectIdForDocument(item.uuid);
        if (!projectId) {
          throw new Error('Could not find project for this diagram');
        }

        // Get the existing document to copy its content
        const existingDocument = await this.mcAPI.getDocument({
          documentID: item.uuid
        });

        // Generate a unique title with suffix
        const duplicateTitle = this.generateDuplicateTitle(originalTitle);

        // Create a new document in the same project
        const newDocument = await this.mcAPI.createDocument(projectId);

        // Set the new document with the original content and new title
        await this.mcAPI.setDocument({
          documentID: newDocument.documentID,
          projectID: projectId,
          title: duplicateTitle,
          code: existingDocument.code
        });

        // Refresh the tree view to show the new diagram
        await this.provider.syncMermaidChart();

        vscode.window.showInformationMessage(`Diagram duplicated as "${duplicateTitle}" successfully.`);
      });
    } catch (error: any) {
      console.error('Error duplicating diagram:', error);
      
      // Check if this is a 402 Payment Required error (free account limit exceeded)
      if (error?.status === 402 || error?.response?.status === 402) {
        vscode.window.showErrorMessage(
          'Unable to create duplicate diagram. You have reached the diagram limit for your free account. Please upgrade your Mermaid Chart subscription to create more diagrams.',
          'Upgrade Subscription'
        ).then(selection => {
          if (selection === 'Upgrade Subscription') {
            vscode.env.openExternal(vscode.Uri.parse('https://www.mermaidchart.com/pricing'));
          }
        });
      } else {
        // Show generic error message for other errors
        vscode.window.showErrorMessage(`Failed to duplicate diagram: ${error.message || error}`);
      }
    }
  }

  /**
   * Generate a title for the duplicate diagram
   */
  private generateDuplicateTitle(originalTitle: string): string {
    return `${originalTitle} - Copy`;
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

    // Register duplicate command
    const duplicateCommand = vscode.commands.registerCommand(
      'mermaidChart.duplicateDiagram',
      async (item: MCTreeItem) => {
        await diagramManager.duplicateDiagram(item);
      }
    );
    context.subscriptions.push(duplicateCommand);

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
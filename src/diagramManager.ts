import * as vscode from 'vscode';
import { MermaidChartVSCode } from './mermaidChartVSCode';
import { MermaidChartProvider, MCTreeItem, Document, getDiagramFromCache, updateDiagramInCache, getProjectIdForDocument, getAllTreeViewProjectsCache } from './mermaidChartProvider';
import { createMermaidFile } from './commands/createFile';
import { ensureIdField } from './frontmatter';
import { getDiagramTemplates } from './util';

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
   * Add a new diagram to a project
   */
  public async addDiagram(item: MCTreeItem, context: vscode.ExtensionContext): Promise<void> {
    // Get project ID - either from the item if it's a project, or find parent project
    let projectId = item.uuid;
    
    // If item has children, it's a project. If not, it might be a document, so get its project
    if (!item.children) {
      projectId = getProjectIdForDocument(item.uuid);
      if (!projectId) {
        vscode.window.showErrorMessage('Could not find project for creating diagram.');
        return;
      }
    }

    // Ask user for diagram name
    const diagramName = await vscode.window.showInputBox({
      prompt: 'Enter diagram name',
      value: '',
      validateInput: (value: string) => {
        if (value && value.length > 100) {
          return 'Diagram name cannot exceed 100 characters';
        }
        return null;
      }
    });

    // If user cancelled, return
    if (diagramName === undefined) {
      return;
    }

    // Use provided name or default to "Untitled diagram"
    const finalName = diagramName.trim() || 'Untitled diagram';

    // Get available diagram templates
    const templates = getDiagramTemplates();
    const templateEntries = Object.entries(templates);

    // Show template selection
    const selectedTemplate = await vscode.window.showQuickPick(
      templateEntries.map(([name, code]) => ({
        label: name,
        description: `Create a ${name.toLowerCase()} diagram`,
        code: code
      })),
      {
        placeHolder: 'Select a diagram type',
        ignoreFocusOut: true
      }
    );

    // If user cancelled template selection, return
    if (!selectedTemplate) {
      return;
    }

    try {
      // Show progress indicator
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Creating diagram...",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: `Creating "${finalName}"` });

        // Create a new document in Mermaid Chart
        const newDocument = await this.mcAPI.createDocument(projectId);

        if (!newDocument || !newDocument.documentID) {
          throw new Error('Failed to create document on Mermaid Chart');
        }

        // Set the document title and selected template code
        await this.mcAPI.setDocument({
          documentID: newDocument.documentID,
          projectID: projectId,
          title: finalName,
          code: selectedTemplate.code
        });

        // Create the initial content with the document ID embedded
        const initialContent = ensureIdField(
          selectedTemplate.code,
          newDocument.documentID
        );

        // Create temporary mermaid file with the document ID
        const editor = await createMermaidFile(context, initialContent, true);

        if (editor) {
          // Refresh the tree view to show the new diagram
          await this.provider.syncMermaidChart();
          
          vscode.window.showInformationMessage(
            `Diagram "${finalName}" created successfully. Edit and save to sync with Mermaid Chart.`
          );
        } else {
          throw new Error('Failed to open editor for the new diagram');
        }
      });
    } catch (error: any) {
      console.error('Error creating diagram:', error);
      
      // Check if this is a 402 Payment Required error (free account limit exceeded)
      if (error?.status === 402 || error?.response?.status === 402) {
        vscode.window.showErrorMessage(
          'Unable to create diagram. You have reached the diagram limit for your free account. Please upgrade your Mermaid Chart subscription to create more diagrams.',
          'Upgrade Subscription'
        ).then(selection => {
          if (selection === 'Upgrade Subscription') {
            vscode.env.openExternal(vscode.Uri.parse('https://www.mermaidchart.com/pricing'));
          }
        });
      } else {
        // Show generic error message for other errors
        vscode.window.showErrorMessage(`Failed to create diagram: ${error.message || error}`);
      }
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

    // Register add diagram command
    const addDiagramCommand = vscode.commands.registerCommand(
      'mermaidChart.addDiagram',
      async (item: MCTreeItem) => {
        await diagramManager.addDiagram(item, context);
      }
    );
    context.subscriptions.push(addDiagramCommand);

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
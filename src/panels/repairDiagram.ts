import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { MermaidChartVSCode } from "../mermaidChartVSCode";

export class RepairDiagram {
  private static mcAPI: MermaidChartVSCode;

  public static setMcAPI(mcAPI: MermaidChartVSCode) {
    RepairDiagram.mcAPI = mcAPI;
  }

  /**
   * Repairs a diagram using AI and shows the diff in VS Code's built-in diff view
   */
  public static async repairDiagram(
    originalCode: string,
    errorMessage: string,
    document: vscode.TextDocument
  ): Promise<void> {
    if (!RepairDiagram.mcAPI) {
      vscode.window.showErrorMessage("Mermaid Chart API not available. Please log in first.");
      return;
    }

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Repairing diagram with AI...",
        cancellable: false
      }, async () => {
        // Call the AI repair API
        const response = await RepairDiagram.mcAPI!.repairDiagram({
          code: originalCode,
          error: errorMessage
        });

        if (response && response.result === 'ok' && response.code) {
          // Extract clean mermaid code from markdown response
          const cleanedCode = RepairDiagram.extractMermaidCode(response.code);
          
          // Show user options for applying the repair
          const applyButton = 'Apply Changes';
          const viewDiffAndApplyButton = 'View Diff and Apply Changes';
          
          const choice = await vscode.window.showInformationMessage(
            '✨ AI has repaired your diagram. What would you like to do?',
            { modal: false },
            applyButton,
            viewDiffAndApplyButton
          );
          
          if (choice === applyButton) {
            // Apply changes directly to the original document
            await RepairDiagram.updateOriginalDocument(cleanedCode, document);
            vscode.window.showInformationMessage("Diagram repaired and applied successfully!");
          } else if (choice === viewDiffAndApplyButton) {
            // Show the diff using VS Code's built-in diff view
            await RepairDiagram.showDiffView(originalCode, cleanedCode, document);
          }
        } else if (response && response.result === 'fail') {
          vscode.window.showErrorMessage("AI could not generate a valid repair for this diagram. Please try fixing it manually.");
        } else {
          vscode.window.showErrorMessage("Failed to repair diagram. Please try again.");
        }
      });
    } catch (error: any) {
      console.error("Error repairing diagram:", error);
      let errorMsg = "Failed to repair diagram.";
      
      if (error.message?.includes("402")) {
        errorMsg = "AI credits limit exceeded. Please check your Mermaid Chart subscription.";
      } else if (error.message?.includes("401") || error.message?.includes("403")) {
        errorMsg = "Please log in to Mermaid Chart to use AI repair feature.";
      } else if (error.message) {
        errorMsg = error.message;
      }

      vscode.window.showErrorMessage(errorMsg);
    }
  }

  /**
   * Shows VS Code's diff view comparing original and repaired code
   */
  private static async showDiffView(
    originalCode: string,
    repairedCode: string,
    document: vscode.TextDocument
  ): Promise<void> {
    try {
      // Use workspace folder root or document directory for temp files
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const isUntitledDocument = document.isUntitled || !document.fileName || document.fileName.startsWith('Untitled-');
      let rootDir: string;
      
      if (isUntitledDocument) {
        // For untitled documents, use system temp directory directly
        rootDir = require('os').tmpdir();
      } else {
        // For regular files, try workspace folder first, then document directory, then fallback to system temp
        rootDir = workspaceFolder?.uri.fsPath ?? path.dirname(document.fileName);
        if (!fs.existsSync(rootDir)) {
          rootDir = require('os').tmpdir();
        }
      }
      
      const tempDir = path.join(rootDir, ".temp-repair");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Always use .old and .new extensions for all files to prevent sync issues
      const baseName = path.basename(document.fileName, path.extname(document.fileName));
      const originalFileName = `${baseName}-original.old`;
      const repairedFileName = `${baseName}-repaired.new`;

      const originalTempPath = path.join(tempDir, originalFileName);
      const repairedTempPath = path.join(tempDir, repairedFileName);

      fs.writeFileSync(originalTempPath, originalCode, "utf8");
      fs.writeFileSync(repairedTempPath, repairedCode, "utf8");

      const originalUri = vscode.Uri.file(originalTempPath);
      const repairedUri = vscode.Uri.file(repairedTempPath);

      // Set language ID to mermaid so preview panel recognizes these temp files
      const originalDoc = await vscode.workspace.openTextDocument(originalUri);
      const repairedDoc = await vscode.workspace.openTextDocument(repairedUri);
      await vscode.languages.setTextDocumentLanguage(originalDoc, 'mermaid');
      await vscode.languages.setTextDocumentLanguage(repairedDoc, 'mermaid');

      // Choose appropriate file watcher based on document type
      if (isUntitledDocument) {
        RepairDiagram.setupTempFileWatcherForTempDocument(repairedTempPath, document, originalUri, repairedUri);
      } else {
        RepairDiagram.setupTempFileWatcher(repairedTempPath, document, originalTempPath);
      }

      // Open diff view
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        repairedUri,
        'AI Repair: Original ↔ Repaired',
        {
          preview: false,
          viewColumn: vscode.ViewColumn.One
        }
      );

    } catch (error) {
      console.error("Error showing diff view:", error);
      vscode.window.showErrorMessage(`Failed to show diff view: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sets up a file watcher for the temp file to detect saves and update the original document.
   * Also cleans up temp files when the diff tab is closed (tabGroups.onDidChangeTabs).
   *
   * NOTE: onDidCloseTextDocument does NOT fire reliably for diff editor tabs because VS Code
   * keeps both documents in memory after the tab is closed. tabGroups.onDidChangeTabs is the
   * correct API – it fires when the actual tab is removed and exposes TabInputTextDiff with
   * the original/modified URIs we can match against.
   */
  private static setupTempFileWatcher(
    tempFilePath: string,
    originalDocument: vscode.TextDocument,
    originalTempPath: string
  ): void {
    const originalUri = vscode.Uri.file(originalTempPath);
    const repairedUri = vscode.Uri.file(tempFilePath);
    let cleaned = false;

    const cleanup = async () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      onSaveDisposable.dispose();
      onTabCloseDisposable.dispose();
      try {
        await vscode.workspace.fs.delete(repairedUri, { recursive: true });
      } catch (_) {
        // Ignore deletion errors
      }
      try {
        await vscode.workspace.fs.delete(originalUri, { recursive: true });
      } catch (_) {
        // Ignore deletion errors
      }
    };

    // For regular files, intercept saves and apply to original document
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDocument) => {
      if (savedDocument.uri.fsPath !== tempFilePath) {
        return;
      }
      try {
        const updatedContent = savedDocument.getText();
        await RepairDiagram.updateOriginalDocument(updatedContent, originalDocument);
        // Do not open or focus any other document - user stays in diff view on the repaired (right) side
      } catch (error) {
        console.error("Error updating original document:", error);
        vscode.window.showErrorMessage(`Failed to apply changes: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });

    // tabGroups.onDidChangeTabs fires when the actual diff tab is closed.
    // The tab's input is TabInputTextDiff which exposes the original/modified URIs.
    const onTabCloseDisposable = vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
      for (const tab of closed) {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          const { original, modified } = tab.input;
          if (
            original.toString() === originalUri.toString() ||
            modified.toString() === repairedUri.toString()
          ) {
            cleanup();
            return;
          }
        }
      }
    });
  }

  /**
   * Updates the original document with the new content
   */
  private static async updateOriginalDocument(newContent: string, originalDocument: vscode.TextDocument): Promise<void> {
    try {
      const fullRange = new vscode.Range(
        originalDocument.positionAt(0),
        originalDocument.positionAt(originalDocument.getText().length)
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(originalDocument.uri, fullRange, newContent);
      await vscode.workspace.applyEdit(edit);

      // Don't save - just apply the edit to update document content without triggering save dialog
    } catch (error) {
      console.error("Error updating original document:", error);
      throw error;
    }
  }

  /**
   * Extracts clean mermaid code from markdown response
   */
  private static extractMermaidCode(markdownText: string): string {
    // Extract mermaid code from ```mermaid ... ``` blocks
    const mermaidBlockRegex = /```mermaid\s*\n?([\s\S]*?)```/gi;
    const match = mermaidBlockRegex.exec(markdownText);
    return match && match[1] ? match[1].trim() : markdownText.trim();
  }



  /**
   * Setup watcher for temp document diff view - intercepts saves to update temp document
   */
  private static setupTempFileWatcherForTempDocument(
    repairedTempPath: string,
    originalDocument: vscode.TextDocument,
    originalUri: vscode.Uri,
    repairedUri: vscode.Uri
  ): void {
    let cleaned = false;

    const cleanup = async () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      onWillSaveDisposable.dispose();
      onTabCloseDisposable.dispose();
      try {
        await vscode.workspace.fs.delete(repairedUri, { recursive: true });
      } catch (_) {
        // Ignore deletion errors
      }
      try {
        await vscode.workspace.fs.delete(originalUri, { recursive: true });
      } catch (_) {
        // Ignore deletion errors
      }
    };

    // Intercept saves on diff view temp files - update temp document instead of saving
    const onWillSaveDisposable = vscode.workspace.onWillSaveTextDocument(async (event) => {
      if (event.document.uri.fsPath !== repairedTempPath) {
        return;
      }
      
      // Prevent the temp file from being saved, instead update the original temp document
      event.waitUntil((async () => {
        try {
          const updatedContent = event.document.getText();
          
          // Update the original temp document content (not save it)
          const fullRange = new vscode.Range(
            originalDocument.positionAt(0),
            originalDocument.positionAt(originalDocument.getText().length)
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(originalDocument.uri, fullRange, updatedContent);
          await vscode.workspace.applyEdit(edit);

          // Return empty edit to prevent actual save of diff temp file
          return [];
        } catch (error) {
          console.error("Error updating temp document:", error);
          vscode.window.showErrorMessage(`Failed to apply changes: ${error instanceof Error ? error.message : "Unknown error"}`);
          // Return empty edit to still prevent save
          return [];
        }
      })());
    });

    // Handle tab close cleanup
    const onTabCloseDisposable = vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
      for (const tab of closed) {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          const { original, modified } = tab.input;
          if (
            original.toString() === originalUri.toString() ||
            modified.toString() === repairedUri.toString()
          ) {
            cleanup();
            return;
          }
        }
      }
    });
  }

}
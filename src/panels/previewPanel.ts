import * as vscode from "vscode";
import { debounce } from "../utils/debounce";
import { getWebviewHTML } from "../templates/previewTemplate";
import { isAuxFile } from "../util";
import * as packageJson from "../../package.json";
import { saveDiagramAsPng, saveDiagramAsSvg } from "../services/renderService";
import { MermaidChartVSCode } from "../mermaidChartVSCode";
import { RepairCodeLensProvider } from "./repairCodeLensProvider";
import { RepairStateManager, ChangeChunk } from "./repairStateManager";
import DecorationManager from "./decorationManager";
import { MermaidChartAuthenticationProvider } from "../mermaidChartAuthenticationProvider";
const DARK_THEME_KEY = "mermaid.vscode.dark";
const LIGHT_THEME_KEY = "mermaid.vscode.light";
const MAX_ZOOM= "mermaid.vscode.maxZoom";
const MAX_CHAR_LENGTH = "mermaid.vscode.maxCharLength";
const MAX_EDGES = "mermaid.vscode.maxEdges";


export class PreviewPanel {
  private static currentPanel: PreviewPanel | undefined;
  private static mcAPI: MermaidChartVSCode | undefined;
  public static codeLensProvider: RepairCodeLensProvider;
  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private isFileChange = false;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private lastContent: string = "";
  private pendingRepair: { 
    originalCode: string; 
    repairedCode: string; 
    originalUri: vscode.Uri;
    changes: ChangeChunk[];
  } | undefined;
  
  // Simple per-preview-panel caching
  private cachedAICredits: {remaining: number, total: number} | null = null;
  private creditsFetched: boolean = false;

  // Use shared decoration manager



  private constructor(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
    this.panel = panel;
    this.document = document;
    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection("mermaid");


    this.update();
    this.setupListeners();
  }

  public static setMcAPI(mcAPI: MermaidChartVSCode) {
    PreviewPanel.mcAPI = mcAPI;
  }

  public static createOrShow(document: vscode.TextDocument) {
    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "mermaidPreview",
      "Mermaid Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    PreviewPanel.currentPanel = new PreviewPanel(panel, document);
  }

  private update() {
    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    const activeEditor = vscode.window.activeTextEditor;
    
    if (!extensionPath) {
      throw new Error("Unable to resolve the extension path");
    }
  
    // Get the current active theme (dark or light)
    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    // Fetch the configuration from VSCode workspace
    const config = vscode.workspace.getConfiguration();

    // Get the theme settings from configuration
    const darkTheme = config.get<string>(DARK_THEME_KEY, "redux-dark");
    const lightTheme = config.get<string>(LIGHT_THEME_KEY, "redux");
    const maxZoom = config.get<number>(MAX_ZOOM, 5);
    const maxCharLength = config.get<number>(MAX_CHAR_LENGTH, 90000);
    const maxEdges = config.get<number>(MAX_EDGES, 1000);

    // Determine the current theme based on the user's preference and the active color theme
    const currentTheme = isDarkTheme ? darkTheme : lightTheme;
      this.lastContent = this.document.getText() || " ";

// Initial content to be used (defaults to a single space if empty)
    const initialContent = this.document.getText() || " ";
  
    if (!this.panel.webview.html) {
      this.panel.webview.html = getWebviewHTML(this.panel, extensionPath, this.lastContent, currentTheme, false);
      // Only fetch credits on initial panel creation
      this.fetchAndSendCredits();
    }
    
    this.panel.webview.postMessage({
      type: "update",
      content:this.lastContent,
      currentTheme: currentTheme,
      isFileChange: this.isFileChange,
      maxZoom: maxZoom,
      maxCharLength: maxCharLength,
      maxEdge: maxEdges,
      aiCredits: this.cachedAICredits, // Always send cached credits if available
    });
    this.isFileChange = false;
  }

  private async fetchAICredits(): Promise<{remaining: number, total: number} | null> {
    try {
      // Return cached credits if available
      if (this.creditsFetched && this.cachedAICredits) {
        return this.cachedAICredits;
      }

      if (PreviewPanel.mcAPI) {
        const response = await PreviewPanel.mcAPI.getAICredits();
        this.cachedAICredits = response.aiCredits;
        this.creditsFetched = true;
        return this.cachedAICredits;
      }
    } catch (error) {
      console.log("Failed to fetch AI credits:", error);
    }
    return null;
  }

  private async fetchAndSendCredits() {
    const aiCredits = await this.fetchAICredits();
    this.panel.webview.postMessage({
      type: "aiCreditsUpdate",
      aiCredits: aiCredits
    });
  }

  private setupListeners() {
    const debouncedUpdate = debounce(() => this.update(), 300);
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === this.document) {
        debouncedUpdate();
      }
    }, this.disposables);

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document?.languageId.startsWith('mermaid')) {
        if (editor.document.uri.toString() !== this.document?.uri.toString()) {
          this.document = editor.document; 
          this.isFileChange = true; 
          debouncedUpdate();
        }
      } 
    }, this.disposables);

    vscode.window.onDidChangeActiveColorTheme(() => {
      this.update(); 
  }, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "error" && message.message) {
        this.handleDiagramError(message.message);
      } else if (message.type === "clearError") {
        this.diagnosticsCollection.clear();
      } else if (message.type === "exportPng" && message.pngBase64) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Exporting PNG...",
          cancellable: false
        }, async () => {
          await saveDiagramAsPng(this.document, message.pngBase64, this.lastContent);
        });
      } else if (message.type === "exportSvg" && message.svgBase64) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Exporting SVG...",
          cancellable: false
        }, async () => {
          await saveDiagramAsSvg(this.document, message.svgBase64, this.lastContent);
        });
      } else if (message.type === "repairDiagram") {
        await this.handleRepairDiagram(message.code, message.errorMessage);
      }
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private handleDiagramError(errorMessage: string) {
    const diagnostics: vscode.Diagnostic[] = [];
    const errorDetails = this.getErrorLine(errorMessage);
  
    if (errorDetails) {
      const caretPositionMatch = errorMessage.match(/(\^)/);
      const lineText = errorMessage.split("\n")[1].trim();
      const caretIndex = caretPositionMatch?.index ?? 0;
      const wordsBeforeCaret = lineText.substring(0, caretIndex).split(/\s+/);
      const wordsAfterCaret = lineText.substring(caretIndex + 1).split(/\s+/);
  
      const startWord = wordsBeforeCaret[wordsBeforeCaret.length - 1];
      const endWord = wordsAfterCaret[0];
  
      const startCharacter = lineText.indexOf(startWord);
      const endCharacter = lineText.indexOf(endWord) + endWord.length;
  
      const range = new vscode.Range(
        errorDetails.line, 
        startCharacter, 
        errorDetails.line, 
        endCharacter
      );
  
      const diagnostic = new vscode.Diagnostic(
        range,
        `Syntax error: ${errorDetails.message}`,
        vscode.DiagnosticSeverity.Error
      );
      
      diagnostics.push(diagnostic);
    }
  
    this.diagnosticsCollection.clear();
    this.diagnosticsCollection.set(this.document.uri, diagnostics);
  }
  
  private getErrorLine(errorMessage: string): { line: number; message: string } | null {
  
    const match = errorMessage.match(/line (\d+):\s*([\s\S]+)/i); // Case-insensitive match for "line <number>: <message>"
    if (match) {
      const line = parseInt(match[1], 10) - 1; // Convert to zero-based index
      const message = errorMessage;
      return { line, message };
    }
    return null;
  }

  private extractMermaidCode(markdownText: string): string {
    // Remove markdown code blocks (```mermaid ... ```)
    const mermaidBlockRegex = /```mermaid\s*\n?([\s\S]*?)```/gi;
    const match = mermaidBlockRegex.exec(markdownText);
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // If no code block found, try to extract from any code block
    const codeBlockRegex = /```[\w]*\s*\n?([\s\S]*?)```/gi;
    const codeMatch = codeBlockRegex.exec(markdownText);
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1].trim();
    }
    
    // If still no match, return the text as-is (might already be clean mermaid code)
    return markdownText.trim();
  }

  private async handleRepairDiagram(code: string, errorMessage: string) {
    if (!PreviewPanel.mcAPI) {
      vscode.window.showErrorMessage("Mermaid Chart API not available. Please log in first.");
      this.panel.webview.postMessage({ type: "repairComplete" });
      return;
    }

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Repairing diagram with AI...",
        cancellable: false
      }, async () => {
        const response = await PreviewPanel.mcAPI!.repairDiagram({
          code: code,
          error: errorMessage
        });

        if (response && response.result === 'ok' && response.code) {
          // Extract clean mermaid code from markdown response
          const cleanedCode = this.extractMermaidCode(response.code);
          
          // Show inline edit with decorations
          await this.showInlineEdit(code, cleanedCode);
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
    } finally {
      // Refresh credits cache after repair and send fresh credits
      this.creditsFetched = false; // Reset cache to fetch fresh credits
      this.fetchAndSendCredits(); // Fetch and send updated credits
      this.panel.webview.postMessage({ 
        type: "repairComplete"
      });
    }
  }

  private async showInlineEdit(originalCode: string, repairedCode: string) {
    try {
      // Clean the repaired code to remove any markdown blocks
      const cleanedRepairedCode = this.extractMermaidCode(repairedCode);

      // Open or focus the original document
      const editor = await vscode.window.showTextDocument(this.document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
        preview: false
      });

      // Calculate individual changes
      const changes = this.calculateChanges(originalCode, cleanedRepairedCode);

      // Apply the repaired code to the document immediately (with undo support)
      const fullRange = new vscode.Range(
        this.document.positionAt(0),
        this.document.positionAt(this.document.getText().length)
      );

      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, cleanedRepairedCode);
      });

      // Store repair state globally (works without preview panel)
      const repairState = {
        originalCode,
        repairedCode: cleanedRepairedCode,
        originalUri: this.document.uri,
        changes
      };
      
      this.pendingRepair = repairState;
      RepairStateManager.getInstance().setRepairState(this.document.uri, repairState);

      // Apply decorations to show what changed
      this.applyInlineDecorations(editor, changes);

      // Set changes in CodeLens provider
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.setPendingChanges(this.document.uri, changes);
      }

      vscode.window.showInformationMessage(
        '✨ AI has repaired your diagram. Use the inline buttons to accept or reject each change.',
        { modal: false }
      );

    } catch (error) {
      console.error("Error showing inline edit:", error);
      vscode.window.showErrorMessage(`Failed to show inline edit: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.panel.webview.postMessage({ type: "repairComplete" });
    }
  }

  private calculateChanges(originalCode: string, repairedCode: string): ChangeChunk[] {
    const originalLines = originalCode.split('\n');
    const repairedLines = repairedCode.split('\n');
    const changes: ChangeChunk[] = [];

    // Simple line-by-line diff
    const maxLines = Math.max(originalLines.length, repairedLines.length);
    let currentChunk: { start: number; end: number; originalText: string; newText: string } | null = null;

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const repairedLine = repairedLines[i] || '';

      if (originalLine !== repairedLine) {
        if (!currentChunk) {
          // Start new chunk
          currentChunk = {
            start: i,
            end: i,
            originalText: originalLine,
            newText: repairedLine
          };
        } else {
          // Extend current chunk
          currentChunk.end = i;
          currentChunk.originalText += '\n' + originalLine;
          currentChunk.newText += '\n' + repairedLine;
        }
      } else {
        if (currentChunk) {
          // End current chunk
          changes.push({
            range: new vscode.Range(currentChunk.start, 0, currentChunk.end, repairedLines[currentChunk.end]?.length || 0),
            originalText: currentChunk.originalText,
            newText: currentChunk.newText,
            status: 'pending'
          });
          currentChunk = null;
        }
      }
    }

    // Add last chunk if exists
    if (currentChunk) {
      changes.push({
        range: new vscode.Range(currentChunk.start, 0, currentChunk.end, repairedLines[currentChunk.end]?.length || 0),
        originalText: currentChunk.originalText,
        newText: currentChunk.newText,
        status: 'pending'
      });
    }

    return changes;
  }

  private applyInlineDecorations(editor: vscode.TextEditor, changes: ChangeChunk[]) {
    const decorationManager = DecorationManager.getInstance();
    const pendingRanges: vscode.Range[] = [];

    // Only show decorations for pending changes
    for (const change of changes) {
      if (change.status === 'pending') {
        pendingRanges.push(change.range);
      }
    }

    // Use shared decoration manager to ensure commands can clear them
    editor.setDecorations(decorationManager.addedDecorationType, pendingRanges);
    editor.setDecorations(decorationManager.removedDecorationType, []);
    
    console.log(`[applyInlineDecorations] Showing ${pendingRanges.length} pending changes`);
  }

  public async acceptSingleChange(lineNumber: number) {
    if (!this.pendingRepair) {
      console.log("[acceptSingleChange] No pending repair");
      return;
    }

    console.log(`[acceptSingleChange] Line ${lineNumber}, have ${this.pendingRepair.changes.length} changes`);

    try {
      const change = this.pendingRepair.changes.find(
        c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber
      );

      if (!change) {
        console.log(`[acceptSingleChange] No change found for line ${lineNumber}`);
        return;
      }

      if (change.status !== 'pending') {
        console.log(`[acceptSingleChange] Change already processed: ${change.status}`);
        return;
      }

      console.log(`[acceptSingleChange] Accepting change at lines ${change.range.start.line}-${change.range.end.line}`);

      // Mark as accepted
      change.status = 'accepted';

      // Update decorations
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this.pendingRepair!.originalUri.toString()
      );

      if (editor) {
        this.applyInlineDecorations(editor, this.pendingRepair.changes);
      }

      // Update CodeLens
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.updateChangeStatus(this.document.uri, lineNumber, 'accepted');
      }

      vscode.window.showInformationMessage(`✓ Change accepted`);

      // Check if all changes are processed
      this.checkIfAllProcessed();

    } catch (error) {
      console.error("Error accepting single change:", error);
      vscode.window.showErrorMessage(`Failed to accept change: ${error}`);
    }
  }

  public async rejectSingleChange(lineNumber: number) {
    if (!this.pendingRepair) {
      console.log("[rejectSingleChange] No pending repair");
      return;
    }

    console.log(`[rejectSingleChange] Line ${lineNumber}, have ${this.pendingRepair.changes.length} changes`);

    try {
      const change = this.pendingRepair.changes.find(
        c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber
      );

      if (!change) {
        console.log(`[rejectSingleChange] No change found for line ${lineNumber}`);
        return;
      }

      if (change.status !== 'pending') {
        console.log(`[rejectSingleChange] Change already processed: ${change.status}`);
        return;
      }

      console.log(`[rejectSingleChange] Rejecting change at lines ${change.range.start.line}-${change.range.end.line}`);

      // Mark as rejected - restore original text
      change.status = 'rejected';

      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this.pendingRepair!.originalUri.toString()
      );

      if (editor) {
        // Replace the new text with original text
        await editor.edit((editBuilder) => {
          editBuilder.replace(change.range, change.originalText);
        });

        // Update decorations
        this.applyInlineDecorations(editor, this.pendingRepair!.changes);
      }

      // Update CodeLens
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.updateChangeStatus(this.document.uri, lineNumber, 'rejected');
      }

      vscode.window.showInformationMessage(`✗ Change rejected`);

      // Check if all changes are processed
      this.checkIfAllProcessed();

    } catch (error) {
      console.error("Error rejecting single change:", error);
      vscode.window.showErrorMessage(`Failed to reject change: ${error}`);
    }
  }

  public async acceptAllChanges() {
    if (!this.pendingRepair) {
      return;
    }

    try {
      // Mark all as accepted
      for (const change of this.pendingRepair.changes) {
        if (change.status === 'pending') {
          change.status = 'accepted';
        }
      }

      // Clear decorations and save
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this.pendingRepair!.originalUri.toString()
      );

      if (editor) {
        const decorationManager = DecorationManager.getInstance();
        editor.setDecorations(decorationManager.addedDecorationType, []);
        editor.setDecorations(decorationManager.removedDecorationType, []);
      }

      await this.document.save();
      
      vscode.window.showInformationMessage("✓ All AI repairs accepted and saved!");

      // Clear CodeLens
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.clearPendingChanges(this.document.uri);
      }

      this.pendingRepair = undefined;
      this.update();

    } catch (error) {
      console.error("Error accepting all changes:", error);
      vscode.window.showErrorMessage(`Failed to accept changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async rejectAllChanges() {
    if (!this.pendingRepair) {
      return;
    }

    try {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this.pendingRepair!.originalUri.toString()
      );

      if (editor) {
        // Clear decorations
        const decorationManager = DecorationManager.getInstance();
        editor.setDecorations(decorationManager.addedDecorationType, []);
        editor.setDecorations(decorationManager.removedDecorationType, []);

        // Restore original code
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, this.pendingRepair!.originalCode);
        });

        vscode.window.showInformationMessage("✗ All AI repairs rejected. Original code restored.");
      }

      // Clear CodeLens
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.clearPendingChanges(this.document.uri);
      }

      this.pendingRepair = undefined;
      this.update();

    } catch (error) {
      console.error("Error rejecting all changes:", error);
      vscode.window.showErrorMessage("Failed to reject changes. You can use Ctrl+Z to undo.");
    }
  }

  private checkIfAllProcessed() {
    if (!this.pendingRepair) {
      return;
    }

    const pending = this.pendingRepair.changes.filter(c => c.status === 'pending');
    
    if (pending.length === 0) {
      // All changes processed - save and cleanup
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this.pendingRepair!.originalUri.toString()
      );

      if (editor) {
        const decorationManager = DecorationManager.getInstance();
        editor.setDecorations(decorationManager.addedDecorationType, []);
        editor.setDecorations(decorationManager.removedDecorationType, []);
      }

      this.document.save();

      const accepted = this.pendingRepair.changes.filter(c => c.status === 'accepted').length;
      const rejected = this.pendingRepair.changes.filter(c => c.status === 'rejected').length;
      
      vscode.window.showInformationMessage(
        `✓ All changes processed! Accepted: ${accepted}, Rejected: ${rejected}`
      );

      // Clear CodeLens
      if (PreviewPanel.codeLensProvider) {
        PreviewPanel.codeLensProvider.clearPendingChanges(this.document.uri);
      }

      this.pendingRepair = undefined;
      this.update();
    }
  }

  public static getCurrentPanel(): PreviewPanel | undefined {
    return PreviewPanel.currentPanel;
  }


  public dispose() {
    PreviewPanel.currentPanel = undefined;
    this.diagnosticsCollection.clear();
    this.diagnosticsCollection.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

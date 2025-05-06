import * as vscode from "vscode";
import { debounce } from "../utils/debounce";
import { getWebviewHTML } from "../templates/previewTemplate";
import { isAuxFile } from "../util";
import * as packageJson from "../../package.json";
const DARK_THEME_KEY = "mermaid.vscode.dark";
const LIGHT_THEME_KEY = "mermaid.vscode.light";
const MAX_ZOOM= "mermaid.vscode.maxZoom";



export class PreviewPanel {
  private static currentPanel: PreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private isFileChange = false;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private lastContent: string = "";



  private constructor(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
    this.panel = panel;
    this.document = document;
    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection("mermaid");


    this.update();
    this.setupListeners();
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

    // Determine the current theme based on the user's preference and the active color theme
    const currentTheme = isDarkTheme ? darkTheme : lightTheme;
      this.lastContent = this.document.getText() || " ";

// Initial content to be used (defaults to a single space if empty)
    const initialContent = this.document.getText() || " ";
  
    if (!this.panel.webview.html) {
      this.panel.webview.html = getWebviewHTML(this.panel, extensionPath, this.lastContent, currentTheme, false);
    }
    this.panel.webview.postMessage({
      type: "update",
      content:this.lastContent,
      currentTheme: currentTheme,
      isFileChange: this.isFileChange,
      maxZoom: maxZoom
    });
    this.isFileChange = false;
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

    this.panel.webview. onDidReceiveMessage((message) => {
      if (message.type === "error" && message.message) {
        this.handleDiagramError(message.message);
      } else if (message.type === "clearError") {
        this.diagnosticsCollection.clear();
    }
    else if (message.type === "fixWithAI") {
      const editor = vscode.window.visibleTextEditors.find(
          (editor) => editor.document.uri.toString() === this.document.uri.toString()
      );
      if (editor) {
          const document = editor.document;
          const diagnostic = this.diagnosticsCollection.get(document.uri)?.[0];
          if (diagnostic) {
              vscode.commands.executeCommand("mermaid-ai.fixDiagram", document, diagnostic.range, diagnostic);
          } else {
              vscode.window.showErrorMessage("No diagnostic information available to fix the diagram.");
          }
      } else {
          vscode.window.showErrorMessage("No editor found for the document to fix the diagram.");
      }
    }
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private handleDiagramError(errorMessage: string) {
    const diagnostics: vscode.Diagnostic[] = [];
    
    // Handle different error message formats
    const errorDetails = this.parseErrorMessage(errorMessage);
  
    if (errorDetails) {
      const range = new vscode.Range(
        errorDetails.line, 
        errorDetails.startCharacter, 
        errorDetails.line, 
        errorDetails.endCharacter
      );
  
      const diagnostic = new vscode.Diagnostic(
        range,
        errorDetails.message,
        vscode.DiagnosticSeverity.Error
      );
      
      diagnostics.push(diagnostic);
    }
  
    this.diagnosticsCollection.clear();
    this.diagnosticsCollection.set(this.document.uri, diagnostics);
  }
  
  private parseErrorMessage(errorMessage: string): { line: number; startCharacter: number; endCharacter: number; message: string } | null {
    // Try matching different error message formats
    
    // Format 1: "line X:" pattern
    const linePattern = /line (\d+):/i;
    const lineMatch = errorMessage.match(linePattern);
    
    // Format 2: "Error on line X" pattern
    const errorLinePattern = /Error on line (\d+)/i;
    const errorLineMatch = errorMessage.match(errorLinePattern);
    
    // Format 3: "Syntax error in graph" pattern
    const syntaxErrorPattern = /Syntax error in graph/i;
    const syntaxErrorMatch = errorMessage.match(syntaxErrorPattern);
    
    let line = 0;
    let startCharacter = 0;
    let endCharacter = 0;
    
    if (lineMatch || errorLineMatch) {
      // Get line number from either format
      line = parseInt((lineMatch?.[1] || errorLineMatch?.[1] || "1"), 10) - 1;
      
      // Try to find the problematic segment in the error message
      const messageLines = errorMessage.split("\n");
      if (messageLines.length > 1) {
        const errorLine = messageLines[1]?.trim() || "";
        const caretLine = messageLines[2] || "";
        
        if (caretLine.includes("^")) {
          // If we have a caret pointer, use it to determine the error position
          const caretIndex = caretLine.indexOf("^");
          startCharacter = Math.max(0, caretIndex - 1);
          endCharacter = Math.min(errorLine.length, caretIndex + 2);
        } else {
          // If no caret, mark the whole line
          startCharacter = 0;
          endCharacter = errorLine.length;
        }
      }
    } else if (syntaxErrorMatch) {
      // For general syntax errors, mark the first line
      line = 0;
      startCharacter = 0;
      endCharacter = this.document.lineAt(0).text.length;
    } else {
      // Default case: mark the first problematic character or word found
      line = 0;
      const documentText = this.document.getText();
      const lines = documentText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
          line = i;
          startCharacter = lines[i].search(/\S/);
          endCharacter = lines[i].length;
          break;
        }
      }
    }
    
    return {
      line,
      startCharacter,
      endCharacter,
      message: errorMessage // Return the complete error message instead of just the first line
    };
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

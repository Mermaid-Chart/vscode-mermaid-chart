import * as vscode from "vscode";
import { debounce } from "../utils/debounce";
import { getWebviewHTML } from "../templates/previewTemplate";
import { isAuxFile } from "../util";
import * as packageJson from "../../package.json";
import * as path from "path";
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
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PreviewPanel.currentPanel) {
      if (PreviewPanel.currentPanel.document.uri === document.uri) {
         PreviewPanel.currentPanel.panel.reveal(column);
         return;
      }
      PreviewPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      "mermaidPreview",
      `Preview: ${path.basename(document.fileName)}`,
      column || vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    PreviewPanel.currentPanel = new PreviewPanel(panel, document);
  }

  private update() {
    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    const activeEditor = vscode.window.activeTextEditor;
    
    if (!extensionPath) {
      throw new Error("Unable to resolve the extension path");
    }
  
    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    const config = vscode.workspace.getConfiguration();

    const darkTheme = config.get<string>(DARK_THEME_KEY, "redux-dark");
    const lightTheme = config.get<string>(LIGHT_THEME_KEY, "redux");
    const maxZoom = config.get<number>(MAX_ZOOM, 5);

    const currentTheme = isDarkTheme ? darkTheme : lightTheme;
      this.lastContent = this.document.getText() || " ";

    const initialContent = this.document.getText() || " ";
  
    this.panel.title = `Preview: ${path.basename(this.document.fileName)}`;

    if (!this.panel.webview.html || this.isFileChange) {
      this.panel.webview.html = getWebviewHTML(this.panel, extensionPath, this.lastContent, currentTheme, false);
    } else {
        this.panel.webview.postMessage({
          type: "update",
          content:this.lastContent,
          currentTheme: currentTheme,
          isFileChange: this.isFileChange,
          maxZoom: maxZoom
        });
    }
    this.isFileChange = false;
  }

  private setupListeners() {
    const debouncedUpdate = debounce(() => this.update(), 300);
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri === this.document.uri) {
        debouncedUpdate();
      }
    }, null, this.disposables);

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId.startsWith('mermaid') && editor.document.uri !== this.document.uri) {
      }
    }, null, this.disposables);

    vscode.window.onDidChangeActiveColorTheme(() => {
      this.update();
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "error":
          if (message.message) {
            this.handleDiagramError(message.message);
          }
          break;
        case "clearError":
          this.diagnosticsCollection.clear();
          break;
        case "exportDiagram":
          await this.handleExportDiagram(message.format, message.data);
          break;
      }
    }, null, this.disposables);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleExportDiagram(format: 'svg' | 'png', data: string) {
    const filters: { [name: string]: string[] } = {};
    let defaultExtension = '';

    if (format === 'svg') {
      filters['SVG Image'] = ['svg'];
      defaultExtension = 'svg';
    } else if (format === 'png') {
      filters['PNG Image'] = ['png'];
      defaultExtension = 'png';
    } else {
      vscode.window.showErrorMessage(`Unsupported export format: ${format}`);
      return;
    }

    const baseName = path.basename(this.document.fileName, path.extname(this.document.fileName));
    const defaultUri = this.document.uri ?
        vscode.Uri.joinPath(this.document.uri, `../${baseName}.${defaultExtension}`) :
        undefined;


    const uri = await vscode.window.showSaveDialog({
      filters,
      defaultUri: defaultUri,
      title: `Export Mermaid Diagram as ${format.toUpperCase()}`
    });

    if (uri) {
      try {
        let contentBuffer: Uint8Array;
        if (format === 'svg') {
          contentBuffer = Buffer.from(data, 'utf8');
        } else {
          const base64Data = data.split(',')[1];
          if (!base64Data) {
            throw new Error("Invalid PNG data URL received.");
          }
          contentBuffer = Buffer.from(base64Data, 'base64');
        }

        await vscode.workspace.fs.writeFile(uri, contentBuffer);
        vscode.window.showInformationMessage(`Diagram exported successfully to ${path.basename(uri.fsPath)}`);
      } catch (error) {
        console.error("Export failed:", error);
        vscode.window.showErrorMessage(`Failed to export diagram: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private handleDiagramError(errorMessage: string) {
    const diagnostics: vscode.Diagnostic[] = [];
    const errorDetails = this.getErrorLine(errorMessage);
  
    if (errorDetails) {
      const caretPositionMatch = errorMessage.match(/(\^)/);
      const lines = errorMessage.split("\n");
      const errorLineIndex = lines.findIndex(line => line.includes('^'));
      const lineText = errorLineIndex > 0 ? lines[errorLineIndex - 1].trim() : '';
      const caretIndex = lines[errorLineIndex]?.indexOf('^') ?? 0;

      let startCharacter = Math.max(0, caretIndex - 5);
      let endCharacter = caretIndex + 5;

      const startMatch = lineText.substring(0, caretIndex).match(/\S+$/);
      if (startMatch && startMatch.index !== undefined) {
          startCharacter = startMatch.index;
      }
      const endMatch = lineText.substring(caretIndex).match(/^\S+/);
       if (endMatch && endMatch.index !== undefined) {
           const wordAfterCaretIndex = lineText.indexOf(endMatch[0], caretIndex);
           if (wordAfterCaretIndex !== -1) {
               endCharacter = wordAfterCaretIndex + endMatch[0].length;
           } else {
               endCharacter = caretIndex + 1;
           }
       } else {
           endCharacter = caretIndex + 1;
       }

       if (startCharacter >= endCharacter) {
           startCharacter = Math.max(0, endCharacter - 1);
       }

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
    } else {
        const range = new vscode.Range(0, 0, 0, 0);
         const diagnostic = new vscode.Diagnostic(
            range,
            `Syntax error: ${errorMessage}`,
            vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
    }
  
    this.diagnosticsCollection.clear();
    this.diagnosticsCollection.set(this.document.uri, diagnostics);
  }
  
  private getErrorLine(errorMessage: string): { line: number; message: string } | null {
  
    const match = errorMessage.match(/line\s+(\d+).*?:\s*([\s\S]+)/i);
    if (match && match[1] && match[2]) {
      const line = parseInt(match[1], 10) - 1;
      const message = errorMessage;
      return { line, message };
    }
     const genericMatch = errorMessage.match(/error.*near\s+line\s+(\d+)/i);
     if (genericMatch && genericMatch[1]) {
         const line = parseInt(genericMatch[1], 10) - 1;
         const message = errorMessage;
         return { line, message };
     }

    return null;
  }

  public dispose() {
    PreviewPanel.currentPanel = undefined;
    this.panel.dispose();

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

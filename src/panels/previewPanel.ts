import * as vscode from "vscode";
import { debounce } from "../utils/debounce";
import { getWebviewHTML } from "../templates/previewTemplate";
import { isAuxFile } from "../util";
import * as packageJson from "../../package.json";
import { saveDiagramAsPng, saveDiagramAsSvg } from "../services/renderService";
import { MermaidChartVSCode } from "../mermaidChartVSCode";
import { RepairDiagram } from "./repairDiagram";
import analytics from "../analytics";
import { setPendingLoginTrigger } from "../loginTrigger";
import { MermaidChartAuthenticationProvider } from "../mermaidChartAuthenticationProvider";
import { getThemeColors } from "../../webview/src/themes/themeConfig";
import { setFrontMatterTheme, getFirstWordFromDiagram } from "../frontmatter";
const DARK_THEME_KEY = "mermaid.vscode.dark";
const LIGHT_THEME_KEY = "mermaid.vscode.light";
const MAX_ZOOM= "mermaid.vscode.maxZoom";
const MAX_CHAR_LENGTH = "mermaid.vscode.maxCharLength";
const MAX_EDGES = "mermaid.vscode.maxEdges";
const MAX_ERROR_REASON_LENGTH = 300;

export type PreviewEntryPoint = 'codeLens' | 'commandPalette' | 'contextMenu';

function toErrorType(errorMessage: string): string {
  if (errorMessage.includes("Maximum text size in diagram exceeded")) {
    return "maxTextSizeExceeded";
  }
  if (errorMessage.includes("Edge limit exceeded")) {
    return "maxEdgesExceeded";
  }
  if (errorMessage.includes("No diagram type detected")) {
    return "unknownDiagramType";
  }
  return "syntaxError";
}

export class PreviewPanel {
  private static currentPanel: PreviewPanel | undefined;
  private static mcAPI: MermaidChartVSCode | undefined;
  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private isFileChange = false;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private lastContent: string = "";
  private hasTrackedPreview = false;
  private lastDiagramType: string | undefined;
  private readonly entryPoint: PreviewEntryPoint | undefined;
  
  private cachedAICredits: {remaining: number, total: number} | null = null;
  private creditsFetched = false;
  private authKnown = false;
  private isUserAuthenticated = false;

  // Use shared decoration manager



  private constructor(
    panel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    entryPoint?: PreviewEntryPoint,
  ) {
    this.panel = panel;
    this.document = document;
    this.entryPoint = entryPoint;
    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection("mermaid");


    this.update(true);
    this.setupListeners();
  }

  public static setMcAPI(mcAPI: MermaidChartVSCode) {
    PreviewPanel.mcAPI = mcAPI;
    RepairDiagram.setMcAPI(mcAPI);
  }

  public static getMcAPI(): MermaidChartVSCode | undefined {
    return PreviewPanel.mcAPI;
  }

  /** Auth snapshot for diff previews — only when this panel has already resolved auth. */
  public static peekAuthState():
    | { aiCredits: { remaining: number; total: number } | null; isAuthenticated: boolean }
    | undefined {
    const panel = PreviewPanel.currentPanel;
    if (!panel?.authKnown) {
      return undefined;
    }
    return {
      aiCredits: panel.cachedAICredits,
      isAuthenticated: panel.isUserAuthenticated,
    };
  }

  public static createOrShow(document: vscode.TextDocument, entryPoint?: PreviewEntryPoint) {
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
    PreviewPanel.currentPanel = new PreviewPanel(panel, document, entryPoint);
  }

  private async update(includeConfiguredTheme = false) {
    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    const activeEditor = vscode.window.activeTextEditor;
    
    if (!extensionPath) {
      throw new Error("Unable to resolve the extension path");
    }
  
    // Get the current active theme (dark or light)
    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    // Fetch the configuration from VSCode workspace
    const config = vscode.workspace.getConfiguration();
    const vscodeThemeName = config.get<string>("workbench.colorTheme","Default Light+");
    console.log(`VS Code theme: ${vscodeThemeName} (${isDarkTheme ? "dark" : "light"})`);

    // Get the theme settings from configuration
    const darkTheme = config.get<string>(DARK_THEME_KEY, "redux-dark");
    const lightTheme = config.get<string>(LIGHT_THEME_KEY, "redux");
    const maxZoom = config.get<number>(MAX_ZOOM, 5);
    const maxCharLength = config.get<number>(MAX_CHAR_LENGTH, 90000);
    const maxEdges = config.get<number>(MAX_EDGES, 1000);

    // Determine the current theme based on the user's preference and the active color theme
    const currentTheme = isDarkTheme ? darkTheme : lightTheme;
    // Get VS Code theme colors using shared config
    const vscodeThemeColors = getThemeColors(vscodeThemeName);
    
    console.log('Theme colors:', vscodeThemeColors);

      this.lastContent = (this.document.getText() || " ").replace(/\r\n/g, '\n');
  
    if (!this.panel.webview.html) {
      this.panel.webview.html = getWebviewHTML(this.panel, extensionPath, this.lastContent, currentTheme, false, {
        maxZoom,
        maxCharLength,
        maxEdges,
      });
      // Only fetch credits on initial panel creation
      this.fetchAndSendCredits();
    }

    const message: Record<string, unknown> = {
      type: "update",
      content:this.lastContent,
      ...(includeConfiguredTheme ? { currentTheme } : {}),
      vscodeThemeName,
      vscodeThemeColors,
      isFileChange: this.isFileChange,
      maxZoom,
      maxCharLength,
      maxEdge: maxEdges,
    };
    if (this.authKnown) {
      message.isAuthenticated = this.isUserAuthenticated;
      message.aiCredits = this.cachedAICredits;
    }
    this.panel.webview.postMessage(message);
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
        this.isUserAuthenticated = true;
        this.authKnown = true;
        return this.cachedAICredits;
      }
    } catch (error) {
      console.log("Failed to fetch AI credits:", error);
    }
    this.authKnown = true;
    this.isUserAuthenticated = false;
    return null;
  }

  private async fetchAndSendCredits() {
    const aiCredits = await this.fetchAICredits();
    this.panel.webview.postMessage({
      type: "aiCreditsUpdate",
      aiCredits,
      isAuthenticated: this.isUserAuthenticated,
    });
  }

  private async refreshAICredits() {
    // Clear cache to force fresh fetch
    this.cachedAICredits = null;
    this.creditsFetched = false;
    await this.fetchAndSendCredits();
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
      this.update(true);
  }, this.disposables);

    vscode.workspace.onDidChangeConfiguration((event) => {
      const themeChanged =
        event.affectsConfiguration(DARK_THEME_KEY) ||
        event.affectsConfiguration(LIGHT_THEME_KEY) ||
        event.affectsConfiguration("workbench.colorTheme");
      if (
        themeChanged ||
        event.affectsConfiguration(MAX_ZOOM) ||
        event.affectsConfiguration(MAX_CHAR_LENGTH) ||
        event.affectsConfiguration(MAX_EDGES)
      ) {
        this.update(themeChanged);
      }
    }, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "error" && message.message) {
        this.handleDiagramError(message.message);
      } else if (message.type === "clearError") {
        this.diagnosticsCollection.clear();
      } else if (message.type === "diagramRendered") {
        // Parse still decides success/failure in the webview; analytics type is the source keyword.
        this.lastDiagramType = getFirstWordFromDiagram(this.lastContent) || undefined;
        this.trackRender("success");
      } else if (message.type === "exportPng" && message.pngBase64) {
        analytics.trackPreviewExportAction("PNG", this.lastDiagramType);
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Exporting PNG...",
          cancellable: false
        }, async () => {
          await saveDiagramAsPng(this.document, message.pngBase64, this.lastContent);
        });
      } else if (message.type === "exportSvg" && message.svgBase64) {
        analytics.trackPreviewExportAction("SVG", this.lastDiagramType);
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Exporting SVG...",
          cancellable: false
        }, async () => {
          await saveDiagramAsSvg(this.document, message.svgBase64, this.lastContent);
        });
      } else if (message.type === "setFrontMatterTheme" && message.theme) {
        await this.applyFrontMatterTheme(message.theme);
      } else if (message.type === "repairDiagram") {
        await this.handleRepairDiagram(message.code, message.errorMessage);
      } else if (message.type === "requestAICredits") {
        await this.fetchAndSendCredits();      } else if (message.type === "login") {
        try {
          analytics.trackUserLogin({ action: 'started', trigger: 'preview-repair' });
          setPendingLoginTrigger('preview-repair');
          await vscode.commands.executeCommand('mermaidChart.login', 'preview-repair');
          // Refresh authentication status and credits after login attempt
          setTimeout(async () => {
            await this.refreshAICredits();
          }, 1000);
        } catch (error) {
          console.error("Error during login:", error);
          vscode.window.showErrorMessage("Failed to initiate login. Please try again.");
        }      } else if (message.type === "openUrl" && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      } else if (message.type === "showWarning" && message.message) {
        await vscode.window.showWarningMessage(message.message as string);
      }
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * A diagram's own `config.theme` overrides `mermaid.initialize`, so for those diagrams the
   * picked theme only sticks once it is written back to the source. Call update() immediately
   * after the edit so we do not wait on the 300ms typing debounce.
   */
  private async applyFrontMatterTheme(theme: string) {
    const currentText = this.document.getText();
    const updatedText = setFrontMatterTheme(currentText, theme);
    if (!updatedText || updatedText === currentText) {
      return;
    }

    const fullRange = new vscode.Range(
      this.document.positionAt(0),
      this.document.positionAt(currentText.length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, fullRange, updatedText);
    await vscode.workspace.applyEdit(edit);
    // Webview already did an optimistic render; this keeps the panel in sync without the
    // typing debounce that would otherwise leave toolbar and SVG out of step.
    await this.update();
  }

  private handleDiagramError(errorMessage: string) {
    this.lastDiagramType = getFirstWordFromDiagram(this.lastContent) || undefined;
    this.trackRender("error", errorMessage);
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

  /** Only the first render of this panel is recorded — not keystroke re-renders. */
  private trackRender(renderStatus: 'success' | 'error', errorMessage?: string) {
    if (!this.entryPoint || this.hasTrackedPreview) {
      return;
    }
    this.hasTrackedPreview = true;

    analytics.trackDiagramPreviewed(this.entryPoint, {
      renderStatus,
      diagramType: this.lastDiagramType,
      ...(errorMessage
        ? {
            errorType: toErrorType(errorMessage),
            errorMessage: this.toSafeErrorReason(errorMessage),
          }
        : {}),
    });
  }

  private toSafeErrorReason(errorMessage: string): string {
    const lines = errorMessage.split("\n").map((line) => line.trim());
    const expectation = lines.find((line) => line.startsWith("Expecting"));

    return [lines[0], expectation]
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_ERROR_REASON_LENGTH);
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

  private async handleRepairDiagram(code: string, errorMessage: string) {
    try {
      await RepairDiagram.repairDiagram(code, errorMessage, this.document);
      // Refresh AI credits after successful repair to reflect usage
      await this.refreshAICredits();
    } catch (error: any) {
      console.error("Error in repair diagram handler:", error);
      vscode.window.showErrorMessage("Failed to repair diagram. Please try again.");
    } finally {
      // Notify webview that repair is complete
      this.panel.webview.postMessage({ type: "repairComplete" });
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

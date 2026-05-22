import * as vscode from "vscode";
import { debounce } from "../utils/debounce";
import { getWebviewHTML } from "../templates/previewTemplate";
import { isAuxFile } from "../util";
import * as packageJson from "../../package.json";
import { saveDiagramAsPng, saveDiagramAsSvg } from "../services/renderService";
import { MermaidChartVSCode } from "../mermaidChartVSCode";
import { RepairDiagram } from "./repairDiagram";
import { MermaidChartAuthenticationProvider } from "../mermaidChartAuthenticationProvider";
import { getThemeColors } from "../../webview/src/themes/themeConfig";
import { canOpenMermaidPreview } from "../util";
const DARK_THEME_KEY = "mermaid.vscode.dark";
const LIGHT_THEME_KEY = "mermaid.vscode.light";
const MAX_ZOOM= "mermaid.vscode.maxZoom";
const MAX_CHAR_LENGTH = "mermaid.vscode.maxCharLength";
const MAX_EDGES = "mermaid.vscode.maxEdges";

function isAxiosUnauthorized(error: unknown): boolean {
  const e = error as { response?: { status?: number }; status?: number };
  return (
    e?.response?.status === 401 ||
    e?.response?.status === 403 ||
    e?.status === 401 ||
    e?.status === 403
  );
}

async function hasMermaidChartSession(): Promise<boolean> {
  const session = await vscode.authentication.getSession(
    MermaidChartAuthenticationProvider.id,
    [],
    { silent: true }
  );
  return !!session;
}

export class PreviewPanel {
  private static currentPanel: PreviewPanel | undefined;
  private static mcAPI: MermaidChartVSCode | undefined;
  /** Set from activate(); avoids getExtension() failing in some dev-host scenarios */
  private static extensionPathOverride: string | undefined;
  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private isFileChange = false;
  private isDisposed = false;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private lastContent: string = "";
  
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
    RepairDiagram.setMcAPI(mcAPI);
  }

  public static setExtensionPath(extensionPath: string) {
    PreviewPanel.extensionPathOverride = extensionPath;
  }

  public static createOrShow(document: vscode.TextDocument) {
    console.log("[MermaidPreview] createOrShow called for:", document.uri.fsPath);

    if (PreviewPanel.currentPanel) {
      const inst = PreviewPanel.currentPanel;
      inst.document = document;
      inst.isFileChange = true;
      void inst.update();
      inst.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const resolvedPath =
      PreviewPanel.extensionPathOverride ??
      vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;

    if (!resolvedPath) {
      console.error("[MermaidPreview] Cannot resolve extension path. extensionPathOverride:", PreviewPanel.extensionPathOverride);
      vscode.window.showErrorMessage("Mermaid Preview: extension path not found. Try reloading.");
      return;
    }

    console.log("[MermaidPreview] Using extension path:", resolvedPath);
    const localRoots = [vscode.Uri.file(resolvedPath)];

    const panel = vscode.window.createWebviewPanel(
      "mermaidPreview",
      "Mermaid Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: localRoots,
      }
    );
    PreviewPanel.currentPanel = new PreviewPanel(panel, document);
  }

  private async update() {
    if (this.isDisposed) {
      return;
    }

    const extensionPath =
      PreviewPanel.extensionPathOverride ??
      vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;

    if (!extensionPath) {
      console.error("[Mermaid Preview] Extension path not resolved.");
      await vscode.window.showErrorMessage(
        "Mermaid Preview could not load (extension path missing). Try reloading the window."
      );
      return;
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

      this.lastContent = this.document.getText() || " ";
  
    if (!this.panel.webview.html) {
      this.panel.webview.html = getWebviewHTML(this.panel, extensionPath, this.lastContent, currentTheme, false, {
        maxZoom,
        maxCharLength,
        maxEdges,
      });
      // Only fetch credits on initial panel creation
      this.fetchAndSendCredits();
    }
    
    this.panel.webview.postMessage({
      type: "update",
      content:this.lastContent,
      currentTheme: currentTheme,
      vscodeThemeName: vscodeThemeName,
      vscodeThemeColors: vscodeThemeColors,
      isFileChange: this.isFileChange,
      maxZoom: maxZoom,
      maxCharLength: maxCharLength,
      maxEdge: maxEdges,
      aiCredits: this.cachedAICredits,
      isAuthenticated: await hasMermaidChartSession()
    });
    this.isFileChange = false;
  }

  private async fetchAICredits(): Promise<{ remaining: number; total: number } | null> {
    try {
      if (this.creditsFetched) {
        return this.cachedAICredits;
      }

      if (PreviewPanel.mcAPI) {
        const response = await PreviewPanel.mcAPI.getAICredits();
        this.cachedAICredits = response.aiCredits;
        this.creditsFetched = true;
        return this.cachedAICredits;
      }
    } catch (error) {
      if (isAxiosUnauthorized(error)) {
        this.cachedAICredits = null;
        this.creditsFetched = true;
      }
      console.debug("Failed to fetch AI credits:", error);
    }
    return null;
  }

  private async fetchAndSendCredits() {
    const isAuthenticated = await hasMermaidChartSession();
    const aiCredits = isAuthenticated ? await this.fetchAICredits() : null;
    if (this.isDisposed) {
      return;
    }
    this.panel.webview.postMessage({
      type: "aiCreditsUpdate",
      aiCredits: aiCredits,
      isAuthenticated: isAuthenticated
    });
  }

  private async refreshAICredits() {
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
      if (editor && canOpenMermaidPreview(editor.document)) {
        if (editor.document.uri.toString() !== this.document.uri.toString()) {
          this.document = editor.document;
          this.isFileChange = true;
          debouncedUpdate();
        }
      }
    }, this.disposables);

    vscode.window.onDidChangeActiveColorTheme(() => {
      this.update(); 
  }, this.disposables);

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(DARK_THEME_KEY) ||
        event.affectsConfiguration(LIGHT_THEME_KEY) ||
        event.affectsConfiguration(MAX_ZOOM) ||
        event.affectsConfiguration(MAX_CHAR_LENGTH) ||
        event.affectsConfiguration(MAX_EDGES) ||
        event.affectsConfiguration("workbench.colorTheme")
      ) {
        this.update();
      }
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
      } else if (message.type === "requestAICredits") {
        await this.fetchAndSendCredits();      } else if (message.type === "login") {
        // Trigger OAuth login flow
        try {
          await vscode.commands.executeCommand('mermaidChart.login');
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
      } else if (message.type === "copyDiagramLink") {
        await this.handleCopyDiagramLink();
      } else if (message.type === "saveDiagram") {
        await vscode.env.openExternal(vscode.Uri.parse("https://mermaid.ai/app/sign-up"));
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

  private async handleCopyDiagramLink(): Promise<void> {
    const mermaidCode = this.lastContent || this.document.getText();
    const encoded = encodeURIComponent(mermaidCode);
    const link = `https://mermaid.live/edit#base64:${Buffer.from(mermaidCode).toString("base64")}`;
    await vscode.env.clipboard.writeText(link);
    vscode.window.showInformationMessage("Diagram link copied to clipboard (mermaid.live)");
  }

  public static getCurrentPanel(): PreviewPanel | undefined {
    return PreviewPanel.currentPanel;
  }

  public dispose() {
    this.isDisposed = true;
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

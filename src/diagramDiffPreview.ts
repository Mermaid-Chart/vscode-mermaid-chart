import * as vscode from "vscode";
import * as packageJson from "../package.json";
import { getThemeColors } from "../webview/src/themes/themeConfig";
import { PreviewPanel } from "./panels/previewPanel";
import { RepairDiagram } from "./panels/repairDiagram";
import { saveDiagramAsPng, saveDiagramAsSvg } from "./services/renderService";
import { getWebviewHTML } from "./templates/previewTemplate";

type AuthPayload = {
  aiCredits: { remaining: number; total: number } | null;
  isAuthenticated: boolean;
};

function readPreviewOptions() {
  const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
  const config = vscode.workspace.getConfiguration();
  const vscodeThemeName = config.get<string>("workbench.colorTheme", "Default Light+");
  return {
    extensionPath: vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)
      ?.extensionPath,
    currentTheme: isDarkTheme
      ? config.get<string>("mermaid.vscode.dark", "redux-dark")
      : config.get<string>("mermaid.vscode.light", "redux"),
    vscodeThemeName,
    vscodeThemeColors: getThemeColors(vscodeThemeName),
    maxZoom: config.get<number>("mermaid.vscode.maxZoom", 5),
    maxCharLength: config.get<number>("mermaid.vscode.maxCharLength", 90000),
    maxEdges: config.get<number>("mermaid.vscode.maxEdges", 1000),
  };
}

async function loadAuthForDiffPreview(): Promise<AuthPayload> {
  const fromPreview = PreviewPanel.peekAuthState();
  if (fromPreview) {
    return fromPreview;
  }

  const mcAPI = PreviewPanel.getMcAPI();
  if (!mcAPI) {
    return { aiCredits: null, isAuthenticated: false };
  }

  try {
    const response = await mcAPI.getAICredits();
    return { aiCredits: response.aiCredits, isAuthenticated: true };
  } catch {
    return { aiCredits: null, isAuthenticated: false };
  }
}

function postAuth(panel: vscode.WebviewPanel, auth: AuthPayload): void {
  panel.webview.postMessage({
    type: "aiCreditsUpdate",
    aiCredits: auth.aiCredits,
    isAuthenticated: auth.isAuthenticated,
  });
}

function wireDiffPreviewMessages(
  panel: vscode.WebviewPanel,
  repairDocumentUri: vscode.Uri | undefined,
  lastContent: string,
  disposables: vscode.Disposable[]
): void {
  disposables.push(
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "exportPng" && message.pngBase64 && repairDocumentUri) {
        const doc = await vscode.workspace.openTextDocument(repairDocumentUri);
        await saveDiagramAsPng(doc, message.pngBase64, lastContent);
      } else if (message.type === "exportSvg" && message.svgBase64 && repairDocumentUri) {
        const doc = await vscode.workspace.openTextDocument(repairDocumentUri);
        await saveDiagramAsSvg(doc, message.svgBase64, lastContent);
      } else if (message.type === "repairDiagram" && repairDocumentUri) {
        try {
          const doc = await vscode.workspace.openTextDocument(repairDocumentUri);
          await RepairDiagram.repairDiagram(
            message.code ?? lastContent,
            message.errorMessage,
            doc
          );
          const auth = await loadAuthForDiffPreview();
          postAuth(panel, auth);
        } catch (error) {
          console.error("Error in diagram diff preview repair handler:", error);
          vscode.window.showErrorMessage("Failed to repair diagram. Please try again.");
        } finally {
          panel.webview.postMessage({ type: "repairComplete" });
        }
      } else if (message.type === "requestAICredits") {
        postAuth(panel, await loadAuthForDiffPreview());
      } else if (message.type === "login") {
        try {
          await vscode.commands.executeCommand("mermaidChart.login");
          setTimeout(() => {
            void loadAuthForDiffPreview().then((auth) => postAuth(panel, auth));
          }, 1000);
        } catch (error) {
          console.error("Error during login from diagram diff preview:", error);
          vscode.window.showErrorMessage("Failed to initiate login. Please try again.");
        }
      } else if (message.type === "openUrl" && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
    })
  );
}

/** Opens one diff preview webview with the same limits/repair flow as the main preview. */
export function setupDiagramDiffPreview(
  panel: vscode.WebviewPanel,
  diagramContent: string,
  repairDocumentUri: vscode.Uri | undefined,
  disposables: vscode.Disposable[]
): void {
  const opts = readPreviewOptions();
  if (!opts.extensionPath) {
    vscode.window.showErrorMessage("Unable to resolve extension path for diagram preview.");
    return;
  }

  panel.webview.html = getWebviewHTML(
    panel,
    opts.extensionPath,
    diagramContent,
    opts.currentTheme,
    false,
    {
      maxZoom: opts.maxZoom,
      maxCharLength: opts.maxCharLength,
      maxEdges: opts.maxEdges,
    }
  );

  wireDiffPreviewMessages(panel, repairDocumentUri, diagramContent, disposables);

  panel.webview.postMessage({
    type: "update",
    currentTheme: opts.currentTheme,
    vscodeThemeName: opts.vscodeThemeName,
    vscodeThemeColors: opts.vscodeThemeColors,
    maxZoom: opts.maxZoom,
    maxCharLength: opts.maxCharLength,
    maxEdge: opts.maxEdges,
  });

  const cached = PreviewPanel.peekAuthState();
  if (cached) {
    postAuth(panel, cached);
  } else {
    void loadAuthForDiffPreview().then((auth) => postAuth(panel, auth));
  }
}

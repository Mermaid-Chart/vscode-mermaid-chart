import * as vscode from "vscode";
import analytics from "../../analytics";
import { generateSyncConfigContent } from "../../templates/syncConfigTemplate";
import {
  configFileUris,
  loadSyncConfig,
  saveSyncConfig,
  SyncConfigModel,
} from "./syncConfigService";

/**
 * Slice 6 Config UX — the sidebar view that hosts the Mermaid Sync control
 * plane. Mirrors the login panel's WebviewViewProvider shape: build the HTML,
 * pump the model in, and translate webview messages into service calls.
 *
 * All file IO lives in {@link syncConfigService}; this class only marshals
 * messages so the view stays a thin shell.
 */
export class SyncConfigPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "mermaidSyncConfig";

  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = generateSyncConfigContent(
      webviewView.webview,
      this.context.extensionUri,
    );

    webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });

    // Re-sync when the user flips back to the view (the files may have changed
    // underneath us, e.g. via the raw-file escape hatch).
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.postModel();
      }
    });
  }

  /** Reveal + refresh the view (used by the open command). */
  async reveal(): Promise<void> {
    await vscode.commands.executeCommand(`${SyncConfigPanelProvider.viewId}.focus`);
    await this.postModel();
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message?.command) {
      case "ready":
        await this.postModel();
        break;
      case "save":
        await this.save(message.model as SyncConfigModel);
        break;
      case "openRaw":
        await this.openRaw(message.file === "smart" ? "smart" : "ignore");
        break;
    }
  }

  private async postModel(): Promise<void> {
    if (!this.view) {
      return;
    }
    const model = await loadSyncConfig();
    void this.view.webview.postMessage({ command: "load", model });
  }

  private async save(model: SyncConfigModel): Promise<void> {
    const result = await saveSyncConfig(model);
    if (!this.view) {
      return;
    }
    if (result.ok) {
      analytics.sendEvent("VS Code Sync Config Saved", "VS_CODE_PLUGIN_SYNC_CONFIG_SAVED");
      void this.view.webview.postMessage({ command: "saved" });
      // Echo the canonical model back so the panel reflects de-duped / trimmed rules.
      await this.postModel();
    } else {
      void this.view.webview.postMessage({ command: "error", message: result.error });
    }
  }

  private async openRaw(which: "ignore" | "smart"): Promise<void> {
    const uris = configFileUris();
    const uri = which === "smart" ? uris.smart : uris.ignore;
    if (!uri) {
      vscode.window.showWarningMessage("Open a folder before editing Mermaid Sync config.");
      return;
    }
    // Create an empty file on first open so the editor has something to show.
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from("", "utf8"));
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}

export const OPEN_SYNC_CONFIG_COMMAND = "mermaidChart.syncConfig.open";

export function registerSyncConfigPanel(
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  const provider = new SyncConfigPanelProvider(context);
  return [
    vscode.window.registerWebviewViewProvider(SyncConfigPanelProvider.viewId, provider),
    vscode.commands.registerCommand(OPEN_SYNC_CONFIG_COMMAND, () => {
      void provider.reveal();
    }),
  ];
}

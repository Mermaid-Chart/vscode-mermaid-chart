import * as vscode from "vscode";
import * as packageJson from "../../package.json";
import { generateSettingsWebviewContent } from "../templates/settingsTemplate";
import { enableTelemetrySetting, updateTelemetrySetting } from "../settings";

const EXTENSION_ID = `${packageJson.publisher}.${packageJson.name}`;

/** Settings webview for sidebar mode `settings`. Telemetry toggle is off by default. */
export class MermaidSettingsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mermaidSettings";

  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration(enableTelemetrySetting) ||
          event.affectsConfiguration("telemetry.telemetryLevel")
        ) {
          this.postSettings();
        }
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "images"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    this.updateWebviewContent();
    this.postSettings();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "setTelemetry" && typeof message.enabled === "boolean") {
        await updateTelemetrySetting(message.enabled);
      }
      if (message.command === "openSettings") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `@ext:${EXTENSION_ID}`
        );
      }
      if (message.command === "ready") {
        this.postSettings();
      }
    });
  }

  async refresh() {
    if (!this._view) {
      return;
    }
    // Reloading the settings view restores the telemetry toggle to its (off) default.
    await updateTelemetrySetting(undefined);
    this.updateWebviewContent();
    this.postSettings();
  }

  private updateWebviewContent() {
    if (this._view) {
      this._view.webview.html = generateSettingsWebviewContent(
        this._view.webview,
        this.context.extensionUri
      );
    }
  }

  private postSettings() {
    const configuration = vscode.workspace.getConfiguration("mermaidChart");
    this._view?.webview.postMessage({
      command: "settingsChanged",
      enableTelemetry: configuration.get<boolean>("enableTelemetry", false),
      vscodeTelemetryEnabled: vscode.env.isTelemetryEnabled,
    });
  }
}

import * as vscode from "vscode";
import { generateWebviewContent } from "../templates/loginTemplate";
import { generateAuthOptionsContent } from "../templates/authOptionsTemplate";

type ViewState = 'login' | 'authOptions';

export class MermaidWebviewProvider implements vscode.WebviewViewProvider {
  private context: vscode.ExtensionContext;
  private _view?: vscode.WebviewView;
  private currentState: ViewState = 'login';
  private refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    try {
      this.updateWebviewContent();
    } catch (err) {
      // If the template throws (missing asset, CSP issue, etc.) we MUST still
      // populate webview.html — otherwise VS Code keeps showing the spinner
      // forever and the user has no way to log in.
      console.error("[MermaidWebviewProvider] failed to render login template:", err);
      const message = err instanceof Error ? err.message : String(err);
      webviewView.webview.html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;color:var(--vscode-foreground)"><h3>Sign in unavailable</h3><p>The sign-in panel failed to render. Open the Output panel (Mermaid Chart) for details.</p><pre style="white-space:pre-wrap;opacity:.7">${message.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre></body></html>`;
    }

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "signIn":
          this.currentState = 'authOptions';
          this.updateWebviewContent();
          break;

        case "startOAuthFlow":
          vscode.commands.executeCommand("mermaidChart.login");
          break;

        case "validateManualToken":
          this.handleManualToken(message.token);
          break;

        case "backToLogin":
          this.currentState = 'login';
          this.updateWebviewContent();
          break;
      }
    });
  }

  refresh() {
    if (!this._view) {
      return;
    }
    // Debounce rapid refresh calls to prevent blank-webview flicker
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.currentState = 'login';
      this.updateWebviewContent();
    }, 150);
  }

  resetToLoginState() {
    this.currentState = 'login';
    if (this._view) {
      this.updateWebviewContent();
    }
  }

  private updateWebviewContent() {
    if (!this._view) {
      return;
    }
    switch (this.currentState) {
      case 'login': {
        this._view.webview.html = generateWebviewContent(
          this._view.webview,
          this.context.extensionUri
        );
        break;
      }
      case 'authOptions': {
        this._view.webview.html = generateAuthOptionsContent(
          this._view.webview,
          this.context.extensionUri
        );
        break;
      }
    }
  }

  private async handleManualToken(token: string) {
    if (!token || token.trim().length === 0) {
      vscode.window.showErrorMessage("Please enter a valid token");
      return;
    }

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Validating token...",
          cancellable: false,
        },
        async () => {
          await vscode.commands.executeCommand("mermaidChart.validateManualToken", token.trim());
        }
      );
    } catch (error) {
      console.error("Manual token validation failed:", error);
    }
  }
}

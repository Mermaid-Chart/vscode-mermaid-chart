import * as vscode from "vscode";
import { generateWebviewContent } from "../templates/loginTemplate";
import { generateAuthOptionsContent } from "../templates/authOptionsTemplate";

type ViewState = 'login' | 'authOptions';

export class MermaidWebviewProvider implements vscode.WebviewViewProvider {
  private context: vscode.ExtensionContext;
  private _view?: vscode.WebviewView;
  private currentState: ViewState = 'login';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "signIn":
          // Show auth options instead of directly logging in
          this.currentState = 'authOptions';
          this.updateWebviewContent();
          break;
          
        case "startOAuthFlow":
          // Start the existing OAuth flow
          vscode.commands.executeCommand("mermaidChart.login");
          break;
          
        case "validateManualToken":
          // Handle manual token validation
          this.handleManualToken(message.token);
          break;
          
        case "backToLogin":
          // Go back to login screen
          this.currentState = 'login';
          this.updateWebviewContent();
          break;
      }
    });
  }
  refresh() {
    if (this._view) {
      this.currentState = 'login'; // Reset to login state on refresh
      this.updateWebviewContent();
    }
  }

  // Reset state after successful authentication
  resetToLoginState() {
    this.currentState = 'login';
    if (this._view) {
      this.updateWebviewContent();
    }
  }

  private updateWebviewContent() {
    if (this._view) {
      switch (this.currentState) {
        case 'login':
          this._view.webview.html = generateWebviewContent(this._view.webview, this.context.extensionUri);
          break;
        case 'authOptions':
          this._view.webview.html = generateAuthOptionsContent(this._view.webview, this.context.extensionUri);
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
      // Show progress while validating
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Validating token...",
          cancellable: false,
        },
        async () => {
          // Trigger manual token validation command
          await vscode.commands.executeCommand("mermaidChart.validateManualToken", token.trim());
        }
      );
    } catch (error) {
      console.error("Manual token validation failed:", error);
    }
  }
}

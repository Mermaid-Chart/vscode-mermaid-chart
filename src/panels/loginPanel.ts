import * as vscode from "vscode";
import { generateWebviewContent } from "../templates/loginTemplate";
export class MermaidWebviewProvider implements vscode.WebviewViewProvider {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "images"),
      ],
    };

    webviewView.webview.html = generateWebviewContent(
      webviewView.webview,
      this.context.extensionUri
    );
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === "signIn") {
        vscode.commands.executeCommand("mermaidChart.login");
      }
    });
  }
}

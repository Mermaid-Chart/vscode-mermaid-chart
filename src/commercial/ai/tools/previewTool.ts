import * as vscode from 'vscode';
import { PreviewBridge } from "@mermaid-chart/vscode-utils";
import { PreviewPanel } from "../../../panels/previewPanel";
import {
  isSignedIn,
  MERMAID_PREVIEW_EXTENSION_ID,
  promptForLogin,
} from "../../../loginTrigger";

export class PreviewBridgeImpl implements PreviewBridge {
  async createOrShowPreview(documentUri?: string, code?: string): Promise<void> {
    if (!(await isSignedIn())) {
      const previewExt = vscode.extensions.getExtension(MERMAID_PREVIEW_EXTENSION_ID);
      if (previewExt && documentUri) {
        try {
          if (!previewExt.isActive) {
            await previewExt.activate();
          }
          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(documentUri),
          );
          await vscode.window.showTextDocument(document);
          await vscode.commands.executeCommand('preview.mermaidChart.preview');
          return;
        } catch (error) {
          console.log(
            { error, documentUri },
            'PLUG-145: Preview handoff failed; falling back to login prompt',
          );
        }
      }
      if (!(await promptForLogin(
        'hard-login-gate',
        'Sign in to Mermaid to preview diagrams. Use Mermaid Preview if you want to continue without an account.',
      ))) {
        return;
      }
    }
    try {
      // If a documentUri is provided, use that existing document
      if (documentUri) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
        PreviewPanel.createOrShow(document);
        return;
      }
      
      // Otherwise use the code parameter
      if (code) {
        const activeEditor = vscode.window.activeTextEditor;
        const activeDocument = activeEditor?.document;
        
        if (!activeDocument || activeDocument.getText() !== code) {
          await vscode.commands.executeCommand(
            "mermaidChart.openResponsePreview", 
            code
          );
        } else {
          PreviewPanel.createOrShow(activeDocument);
        }
      }
    } catch (error) {
      console.error("Error in preview bridge:", error);
      throw error;
    }
  }
}
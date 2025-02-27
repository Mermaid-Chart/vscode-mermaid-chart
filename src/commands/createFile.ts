import * as vscode from "vscode";
import { PreviewPanel } from "../panels/previewPanel";
import { TempFileCache } from "../cache/tempFileCache";
import analytics from "../analytics";
import { DocumentManager } from '../yjs/DocumentManager';
import { SupabaseClient } from '@supabase/supabase-js';

let documentManager: DocumentManager | null = null;

export function initializeDocumentManager(supabase: SupabaseClient) {
  documentManager = new DocumentManager(supabase);
  return documentManager;
}

export async function createMermaidFile(
  context: vscode.ExtensionContext,
  diagramContent: string | null,
  isTempFile: boolean
): Promise<vscode.TextEditor | null> {
  const exampleContent = `flowchart TD
    A[Start] --> B[End]`;

  try {
    const document = await vscode.workspace.openTextDocument({
      language: "mermaid",
      content: diagramContent ?? exampleContent
    });

    const editor = await vscode.window.showTextDocument(document);
    if (!editor?.document) {
      return null;
    }

    const uri = editor.document.uri.toString();

    if (isTempFile) {
      TempFileCache.addTempUri(context, uri);
    } else {
      TempFileCache.removeTempUri(context, uri);
    }

    // Initialize real-time collaboration
    if (documentManager) {
      await documentManager.connectDocument(editor.document);
    }

    PreviewPanel.createOrShow(editor.document);
    return editor;
  } catch (error) {
    console.error("Error creating Mermaid file:", error);
    analytics.trackException(error);
    return null;
  }
}

export function getPreview() {
  const activeEditor = vscode.window.activeTextEditor;
  
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor. Open a .mmd file to preview.");
    return;
  }

  const document = activeEditor.document;
  if (document.languageId !== "plaintext" && 
      !document.fileName.endsWith(".mmd") && 
      !document.fileName.endsWith(".mermaid") && 
      !document.languageId.startsWith('mermaid')) {
    vscode.window.showErrorMessage("Mermaid Preview is only available for mermaid files.");
    return;
  }
  PreviewPanel.createOrShow(document);
}
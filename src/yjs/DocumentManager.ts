import * as vscode from 'vscode';
import { YDocManager } from './YDocManager';
import { extractIdFromCode } from '../frontmatter';
import { SupabaseClient } from '@supabase/supabase-js';

export class DocumentManager {
  private documents = new Map<string, YDocManager>();
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly supabase: SupabaseClient) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e)),
      vscode.workspace.onDidCloseTextDocument(e => this.onDocumentClosed(e))
    );
  }

  public async connectDocument(document: vscode.TextDocument) {
    if (!this.isMermaidDocument(document)) {
      return;
    }

    const diagramId = extractIdFromCode(document.getText());
    if (!diagramId) {
      return;
    }

    if (this.documents.has(document.uri.toString())) {
      return;
    }

    const yDocManager = new YDocManager(
      diagramId,
      this.supabase,
      (content: string) => this.updateDocumentContent(document, content)
    );

    this.documents.set(document.uri.toString(), yDocManager);
    yDocManager.updateContent(document.getText());
  }

  private onDocumentChanged(event: vscode.TextDocumentChangeEvent) {
    const { document } = event;
    if (!this.isMermaidDocument(document)) {
      return;
    }

    const yDocManager = this.documents.get(document.uri.toString());
    if (!yDocManager) {
      void this.connectDocument(document);
      return;
    }

    if (event.contentChanges.length > 0) {
      yDocManager.updateContent(document.getText());
    }
  }

  private onDocumentClosed(document: vscode.TextDocument) {
    const yDocManager = this.documents.get(document.uri.toString());
    if (yDocManager) {
      yDocManager.dispose();
      this.documents.delete(document.uri.toString());
    }
  }

  private async updateDocumentContent(document: vscode.TextDocument, content: string) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    
    edit.replace(document.uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
  }

  private isMermaidDocument(document: vscode.TextDocument): boolean {
    return document.languageId.startsWith('mermaid');
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
    for (const doc of this.documents.values()) {
      doc.dispose();
    }
    this.documents.clear();
  }
} 
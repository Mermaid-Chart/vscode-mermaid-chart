import * as vscode from "vscode";

interface ChangeChunk {
  range: vscode.Range;
  originalText: string;
  newText: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export class RepairCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private pendingChanges: Map<string, ChangeChunk[]> = new Map();

  public setPendingChanges(uri: vscode.Uri, changes: ChangeChunk[]) {
    this.pendingChanges.set(uri.toString(), changes);
    this._onDidChangeCodeLenses.fire();
  }

  public clearPendingChanges(uri: vscode.Uri) {
    this.pendingChanges.delete(uri.toString());
    this._onDidChangeCodeLenses.fire();
  }

  public getChange(uri: vscode.Uri, lineNumber: number): ChangeChunk | undefined {
    const changes = this.pendingChanges.get(uri.toString());
    if (!changes) return undefined;
    return changes.find(c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber);
  }

  public updateChangeStatus(uri: vscode.Uri, lineNumber: number, status: 'accepted' | 'rejected') {
    const changes = this.pendingChanges.get(uri.toString());
    if (!changes) return;
    
    const change = changes.find(c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber);
    if (change) {
      change.status = status;
      this._onDidChangeCodeLenses.fire();
    }
  }

  public getAllChanges(uri: vscode.Uri): ChangeChunk[] | undefined {
    return this.pendingChanges.get(uri.toString());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const changes = this.pendingChanges.get(document.uri.toString());
    if (!changes || changes.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    for (const change of changes) {
      if (change.status === 'pending') {
        // Add "Accept" button
        codeLenses.push(
          new vscode.CodeLens(change.range, {
            title: "✓ Accept",
            command: "mermaidChart.acceptSingleChange",
            arguments: [document.uri, change.range.start.line]
          })
        );

        // Add "Reject" button
        codeLenses.push(
          new vscode.CodeLens(change.range, {
            title: "✗ Reject",
            command: "mermaidChart.rejectSingleChange",
            arguments: [document.uri, change.range.start.line]
          })
        );
      }
      // Don't show any CodeLens for accepted/rejected changes - they're done
    }

    // Add "Accept All" and "Reject All" at the top
    const pendingCount = changes.filter(c => c.status === 'pending').length;
    if (pendingCount > 0) {
      codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `✓ Accept All (${pendingCount} changes)`,
          command: "mermaidChart.acceptAllChanges",
          arguments: [document.uri]
        })
      );

      codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `✗ Reject All`,
          command: "mermaidChart.rejectAllChanges",
          arguments: [document.uri]
        })
      );
    }

    return codeLenses;
  }
}

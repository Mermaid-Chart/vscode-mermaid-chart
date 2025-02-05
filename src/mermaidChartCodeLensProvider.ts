import * as vscode from "vscode";
import { MermaidChartToken } from "./util";
import path = require("path");

export class MermaidChartCodeLensProvider implements vscode.CodeLensProvider {
  private readonly patterns: Record<string, RegExp> = {
    ".md": /```mermaid[\s\S]*?```/g,
    ".html": /<div class=["']mermaid["']>[\s\S]*?<\/div>/g,
    ".hugo": /{{<mermaid[^>]*>}}[\s\S]*?{{<\/mermaid>}}/g,
    ".rst": /\.\. mermaid::[\s\S]*?/g,
  };

  constructor(private mermaidChartTokens: MermaidChartToken[]) {}

  setMermaidChartTokens(mermaidChartTokens: MermaidChartToken[]) {
    this.mermaidChartTokens = mermaidChartTokens;
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const fileExt = path.extname(document.fileName);
    const allowedExtensions = [".md", ".html", ".rst", ".hugo"];
    if (allowedExtensions.includes(fileExt)) {
    
    const text = document.getText();

    const mermaidRegex = this.patterns[fileExt];
    let match;

    while ((match = mermaidRegex.exec(text)) !== null) {
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(start, end);

      const editMarkdownCommand: vscode.Command = {
        title: "Edit Aux File",
        command: "mermaid.editAuxFile",
        arguments: [document.uri],
      };

      codeLenses.push(new vscode.CodeLens(range, editMarkdownCommand));
    }
  }


    for (const token of this.mermaidChartTokens) {
      const viewCommand: vscode.Command = {
        title: "View Diagram",
        command: "extension.viewMermaidChart",
        arguments: [token.uuid],
      };

      const editInMermaidChartCommand: vscode.Command = {
        title: "Edit Diagram in Mermaid Chart",
        command: "extension.editMermaidChart",
        arguments: [token.uuid],
      };

      const editCommand: vscode.Command = {
        title: "Edit Diagram",
        command: "extension.editLocally",
        arguments: [token.uuid],
      };

      codeLenses.push(new vscode.CodeLens(token.range, viewCommand));
      codeLenses.push(new vscode.CodeLens(token.range, editInMermaidChartCommand));
      codeLenses.push(new vscode.CodeLens(token.range, editCommand));
    }

    return codeLenses;
  }
}

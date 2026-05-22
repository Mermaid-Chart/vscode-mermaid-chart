import * as vscode from "vscode";
import {  applyGutterIconDecoration, isAuxFile, MermaidChartToken } from "./util";
import { MermaidChartAuthenticationProvider } from "./mermaidChartAuthenticationProvider";
import { extractIdFromCode, extractMetadataFromCode, checkReferencedFiles, findDiagramContentStartPosition } from "./frontmatter";

export class MermaidChartCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private mermaidChartTokens: MermaidChartToken[]) {}

  setMermaidChartTokens(mermaidChartTokens: MermaidChartToken[]) {
    this.mermaidChartTokens = mermaidChartTokens;
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true }
    );

    if (document.languageId.startsWith("mermaid")) {
      this.provideCodeLensesForMermaid(document, codeLenses, session);
    } else {
      for (const token of this.mermaidChartTokens) {
        const tokenUri = token.uri?.toString() ?? "";
        if (tokenUri && tokenUri !== document.uri.toString()) {
          continue;
        }
        const documentText = document.getText(token.range);
        const diagramId = extractIdFromCode(documentText);
        const isAux = isAuxFile(document.fileName);
        if (isAux) {
          this.addAuxFileCodeLenses(codeLenses, token, session, diagramId);
        } else {
          this.addMainFileCodeLenses(codeLenses, token);
        }
      }
      this.addGenerateDiagramCodeLenses(document, codeLenses);
    }

    return codeLenses;
  }

  /** Flow 1: lenses at top and bottom of non-diagram source files. */
  private addGenerateDiagramCodeLenses(document: vscode.TextDocument, codeLenses: vscode.CodeLens[]): void {
    if (!this.isEligibleForGenerateDiagramCodeLens(document)) {
      return;
    }
    const top = new vscode.Range(0, 0, 0, 0);
    const lastLine = Math.max(0, document.lineCount - 1);
    const bottom = new vscode.Range(lastLine, 0, lastLine, 0);

    const lenses: vscode.CodeLens[] = [
      new vscode.CodeLens(top, {
        title: "$(sparkle) Generate Mermaid diagram",
        command: "mermaidChart.generateDiagram",
        tooltip: "Whole file or current selection → new diagram + preview",
      }),
      new vscode.CodeLens(top, {
        title: "$(comment) Open chat @mermaid-chart",
        command: "mermaidChart.openCopilotChat",
        tooltip: "Open chat with @mermaid-chart",
      }),
    ];

    for (const lens of lenses) {
      codeLenses.push(lens);
    }

    if (lastLine > 0) {
      for (const lens of lenses) {
        codeLenses.push(new vscode.CodeLens(bottom, lens.command));
      }
    }
  }

  private isEligibleForGenerateDiagramCodeLens(document: vscode.TextDocument): boolean {
    if (document.languageId.startsWith("mermaid")) {
      return false;
    }
    const name = document.fileName.toLowerCase();
    if (name.endsWith(".mmd") || name.endsWith(".mermaid")) {
      return false;
    }
    if (document.uri.scheme === "output" || document.uri.scheme === "vscode-scm") {
      return false;
    }
    return true;
  }
  
  private addAuxFileCodeLenses(
    codeLenses: vscode.CodeLens[],
    token: MermaidChartToken,
    session: vscode.AuthenticationSession | undefined,
    diagramId: string | undefined
  ) {
    if (session && !diagramId) {
      codeLenses.push(this.createCodeLens(token, "Connect Diagram", "mermaid.connectDiagram", [token.uri, token.range]));
    } else if (session && diagramId) {
      codeLenses.push(this.createCodeLens(token, "Edit Diagram in Mermaid Chart", "extension.editMermaidChart", [diagramId]));
    }
    codeLenses.push(this.createCodeLens(token, "Edit Diagram", "mermaid.editAuxFile", [token.uri, token.range]));
  }
  
  private addMainFileCodeLenses(
    codeLenses: vscode.CodeLens[],
    token: MermaidChartToken
  ) {
    codeLenses.push(this.createCodeLens(token, "View Diagram", "mermaidChart.viewMermaidChart", [token.uuid]));
    codeLenses.push(this.createCodeLens(token, "Edit Diagram in Mermaid Chart", "extension.editMermaidChart", [token.uuid]));
    codeLenses.push(this.createCodeLens(token, "Edit Diagram", "mermaidChart.editLocally", [token.uuid]));
  }
  
  private createCodeLens(
    token: MermaidChartToken,
    title: string,
    command: string,
    args: any[]
  ): vscode.CodeLens {
    return new vscode.CodeLens(token.range, { title, command, arguments: args });
  }

  private provideCodeLensesForMermaid(document: vscode.TextDocument, codeLenses: vscode.CodeLens[], session: vscode.AuthenticationSession | undefined) {
    const firstLine = new vscode.Range(0, 0, 0, 0);
    const lastLine = Math.max(0, document.lineCount - 1);
    const lastLineRange = new vscode.Range(lastLine, 0, lastLine, 0);

    const mermaidTopBottomLenses = [
      new vscode.CodeLens(firstLine, {
        title: "$(lightbulb) Improve this diagram",
        command: "mermaidChart.improveDiagram",
        arguments: [document.uri],
        tooltip: "Open Diagram Suggestions",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(link) Copy link",
        command: "mermaidChart.copyDiagramLink",
        arguments: [],
        tooltip: "Copy mermaid.live share link",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(cloud-upload) Repair & save to cloud",
        command: "mermaidChart.repairAndSaveToCloud",
        arguments: [],
        tooltip: "Repair syntax, then sign in to save to cloud",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(preview) Preview diagram",
        command: "mermaidChart.preview",
        arguments: [],
        tooltip: "Open or focus the Mermaid preview",
      }),
    ];
    codeLenses.push(...mermaidTopBottomLenses);
    if (lastLine > 0) {
      for (const lens of mermaidTopBottomLenses) {
        codeLenses.push(new vscode.CodeLens(lastLineRange, lens.command));
      }
    }

    const text = document.getText();
    const metadata = extractMetadataFromCode(text);
    if (metadata?.references) {
      let workspacePath = '';
      
      // Handle untitled files differently
      if (document.uri.scheme === 'untitled') {
        // Use the first workspace folder as fallback for untitled files
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          workspacePath = workspaceFolders[0].uri.fsPath;
        }
      } else {
        // For regular files, use the containing workspace folder
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : '';
      }
      
      // Only proceed with checking references if we have a valid workspace path
      if (workspacePath) {
        const changedReferencesList = checkReferencedFiles(metadata, workspacePath);
        if (changedReferencesList?.length > 0) {
          // Get the position where diagram text starts
          const diagramStartIndex = findDiagramContentStartPosition(text);
          const diagramStartPosition = document.positionAt(diagramStartIndex);
          
          // Create a range at the beginning of the line where diagram text starts
          const codeLensPosition = new vscode.Range(diagramStartPosition.line, 0, diagramStartPosition.line, 0);
          
          codeLenses.push(
            new vscode.CodeLens(codeLensPosition, {
              title: "▷ Regenerate Diagram",
              command: "mermaidChart.regenerateDiagram",
              arguments: [document.uri, metadata.query, changedReferencesList, metadata, session ? true: false],
            })
          );
          applyGutterIconDecoration(codeLensPosition);
        }
      }
    }
  }
}

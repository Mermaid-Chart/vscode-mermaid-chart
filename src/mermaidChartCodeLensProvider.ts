import * as path from "path";
import * as vscode from "vscode";
import {  applyGutterIconDecoration, isAuxFile, MermaidChartToken } from "./util";
import { MermaidChartAuthenticationProvider } from "./mermaidChartAuthenticationProvider";
import { extractIdFromCode, extractMetadataFromCode, checkReferencedFiles, findDiagramContentStartPosition } from "./frontmatter";

export class MermaidChartCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private mermaidChartTokens: MermaidChartToken[]) {}

  setMermaidChartTokens(mermaidChartTokens: MermaidChartToken[]) {
    this.mermaidChartTokens = mermaidChartTokens;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
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
    } else if (this.isCodingFile(document) && this.showGenerateDiagramCodeLens()) {
      this.addCodingFileCodeLenses(codeLenses, document);
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
    }
  
    return codeLenses;
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

  /**
   * Check if the document is a coding file that should show our CodeLens commands
   */
  private isCodingFile(document: vscode.TextDocument): boolean {
    // Comprehensive list of coding file extensions
    const codingExtensions = [
      // JavaScript/TypeScript
      '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
      // Python
      '.py', '.pyw', '.pyi',
      // Java/JVM languages
      '.java', '.kt', '.scala', '.groovy',
      // C/C++
      '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
      // C#/.NET
      '.cs', '.vb', '.fs', '.fsx',
      // Go
      '.go',
      // Rust
      '.rs',
      // PHP
      '.php', '.phtml',
      // Ruby
      '.rb', '.rbx',
      // Swift
      '.swift',
      // Other popular languages
      '.dart', '.lua', '.perl', '.pl', '.r', '.m', '.mm',
      '.clj', '.cljs', '.elm', '.ex', '.exs', '.hs', '.jl',
      '.nim', '.pas', '.pp', '.sh', '.bash', '.zsh', '.fish',
      // Configuration/Scripting
      '.sql', '.ps1', '.psm1', '.psd1'
    ];

    const fileExt = path.extname(document.fileName).toLowerCase();
    if (!fileExt) return false;

    return codingExtensions.includes(fileExt);
  }

  private showGenerateDiagramCodeLens(): boolean {
    return vscode.workspace
      .getConfiguration("mermaidChart")
      .get<boolean>("showGenerateDiagramCodeLens", true);
  }

  /**
   * Add CodeLens commands for coding files at the end of the file
   */
  private addCodingFileCodeLenses(codeLenses: vscode.CodeLens[], document: vscode.TextDocument): void {
    const lineCount = document.lineCount;
    if (lineCount === 0) {
      return;
    }

    // VS Code renders CodeLens above the target line: on a non-empty last line the lens
    const targetLine = lineCount - 1;
    const codeInRange = new vscode.Range(targetLine, 0, targetLine, 0);

    // Add "Generate Mermaid Diagram" command
    codeLenses.push(
      new vscode.CodeLens(codeInRange, {
        title: "▷ Generate Mermaid Diagram",
        command: "mermaidChart.generateDiagramFromCode",
        arguments: []
      })
    );

    // Add "Open Chat @mermaid-chart" command  
    codeLenses.push(
      new vscode.CodeLens(codeInRange, {
        title: "💬 Open Chat @mermaid-chart", 
        command: "mermaidChart.openCopilotChat",
        arguments: []
      })
    );
  }

  private provideCodeLensesForMermaid(document: vscode.TextDocument, codeLenses: vscode.CodeLens[], session: vscode.AuthenticationSession | undefined) {
    const firstLine = new vscode.Range(0, 0, 0, 0);

    const mermaidTopBottomLenses = [
      new vscode.CodeLens(firstLine, {
        title: "$(lightbulb) Improve this diagram",
        command: "mermaidChart.improveDiagram",
        arguments: [document.uri],
        tooltip: "Open Improve diagram in the sidebar",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(wrench) Repair diagram",
        command: "mermaidChart.repairDiagram",
        arguments: [],
        tooltip: "Repair syntax with Mermaid Chart AI",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(cloud-upload) Save to Mermaid Chart",
        command: "mermaidChart.connectDiagramToMermaidChart",
        arguments: [],
        tooltip: "Connect or save this diagram to your Mermaid Chart account",
      }),
      new vscode.CodeLens(firstLine, {
        title: "$(preview) Preview diagram",
        command: "mermaidChart.preview",
        arguments: [],
        tooltip: "Open or focus the Mermaid preview",
      }),
    ];
    codeLenses.push(...mermaidTopBottomLenses);

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

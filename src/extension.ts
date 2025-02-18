import * as vscode from "vscode";
import { MermaidChartProvider, MCTreeItem, getAllTreeViewProjectsCache, Document } from "./mermaidChartProvider";
import { MermaidChartVSCode } from "./mermaidChartVSCode";
import {
  applyMermaidChartTokenHighlighting,
  editMermaidChart,
  ensureConfigBlock,
  extractIdFromCode,
  extractMermaidCode,
  findComments,
  findMermaidChartTokens,
  findMermaidChartTokensFromAuxFiles,
  getMermaidChartTokenDecoration,
  hasConfigId,
  insertMermaidChartToken,
  isAuxFile,
  syncAuxFile,
  updateViewVisibility,
  viewMermaidChart,
} from "./util";
import { MermaidChartCodeLensProvider } from "./mermaidChartCodeLensProvider";
import { createMermaidFile, getPreview } from "./commands/createFile";
import { handleTextDocumentChange } from "./eventHandlers";
import path = require("path");
import { TempFileCache } from "./cache/tempFileCache";
import { PreviewPanel } from "./panels/previewPanel";
import { getSnippetsBasedOnDiagram } from "./constants/condSnippets";
import { customErrorMessage } from "./constants/errorMessages";
import { MermaidWebviewProvider } from "./panels/loginPanel";

let diagramMappings: { [key: string]: string[] } = require('../src/diagramTypeWords.json');
let isExtensionStarted = false;



export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating Mermaid Chart extension");

  const isUserLoggedIn = context.globalState.get<boolean>("isUserLoggedIn", false);
  const mermaidWebviewProvider = new MermaidWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("mermaidWebview", mermaidWebviewProvider)
  );
  updateViewVisibility(isUserLoggedIn);

 

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.preview', getPreview)
  );
 


  const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && !isExtensionStarted) {
        isExtensionStarted = true;
        handleTextDocumentChange(activeEditor, diagramMappings, true);
    }

  vscode.workspace.onDidChangeTextDocument((event) =>
    handleTextDocumentChange(event, diagramMappings, false)
  );
  vscode.window.onDidChangeActiveTextEditor((event) =>
    handleTextDocumentChange(event, diagramMappings, true)
  );

  
  vscode.commands.registerCommand('mermaidChart.createMermaidFile', async () => {
    createMermaidFile(context, null, false)
  })
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.logout', async () => {
      mcAPI.logout(context);
      const userLoggedIn = false; 

      await context.globalState.update("isUserLoggedIn", userLoggedIn);
      updateViewVisibility(false);
    })
  );

  const mcAPI = new MermaidChartVSCode();
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.login', async () => {
      await mcAPI.login();
      const userLoggedIn = true; 

  await context.globalState.update("isUserLoggedIn", userLoggedIn);
  updateViewVisibility(true);
  mermaidChartProvider.refresh()

    })
  );

  await mcAPI.initialize(context);

  const mermaidChartProvider: MermaidChartProvider = new MermaidChartProvider(
    mcAPI
  );

 let  mermaidChartTokenDecoration: vscode.TextEditorDecorationType;
  mermaidChartTokenDecoration = getMermaidChartTokenDecoration();
  vscode.window.onDidChangeActiveColorTheme(() => {
    mermaidChartTokenDecoration.dispose(); 
    mermaidChartTokenDecoration = getMermaidChartTokenDecoration(); 
  });
  


    const mermaidChartGutterIconDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(context.asAbsolutePath("images/mermaid-icon-16.png")), // Add the icon file path
      gutterIconSize: "8x8",// Adjust the icon size as desired
    });
  let codeLensProvider: MermaidChartCodeLensProvider | undefined;

  function updateMermaidChartTokenHighlighting() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      let mermaidChartTokens
      if (!isAuxFile(activeEditor.document.fileName)) {
        const comments = findComments(activeEditor.document);
        mermaidChartTokens = findMermaidChartTokens(
          activeEditor.document,
          comments
        );
      } else {
        mermaidChartTokens = findMermaidChartTokensFromAuxFiles(activeEditor.document)
      }

      applyMermaidChartTokenHighlighting(
        activeEditor,
        mermaidChartTokens,
        mermaidChartTokenDecoration,
        mermaidChartGutterIconDecoration
      );

      if (!codeLensProvider) {
        codeLensProvider = new MermaidChartCodeLensProvider(mermaidChartTokens);
        context.subscriptions.push(
          vscode.languages.registerCodeLensProvider("*", codeLensProvider)
        );
      } else {
        codeLensProvider.setMermaidChartTokens(mermaidChartTokens);
      }
    }
  }

  updateMermaidChartTokenHighlighting();

  vscode.window.onDidChangeActiveTextEditor(
    () => {
      updateMermaidChartTokenHighlighting();
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeTextDocument(
    () => {
      updateMermaidChartTokenHighlighting();
    },
    null,
    context.subscriptions
  );

  const viewCommandDisposable = vscode.commands.registerCommand(
    "extension.viewMermaidChart",
    (uuid: string) => {
      return viewMermaidChart(mcAPI, uuid);
    }
  );

  context.subscriptions.push(viewCommandDisposable);

  const treeView = vscode.window.createTreeView("mermaidChart", {
    treeDataProvider: mermaidChartProvider,
  });
  vscode.window.registerTreeDataProvider("mermaidChart", mermaidChartProvider);

  const editCommandDisposable = vscode.commands.registerCommand(
    "extension.editMermaidChart",
    (uuid: string) => {
      return editMermaidChart(mcAPI, uuid, mermaidChartProvider);
    }
  );
  context.subscriptions.push(editCommandDisposable);

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.editLocally", (uuid: string) => {
      const projects = getAllTreeViewProjectsCache();
  
      // Find the diagram code based on the UUID
      const diagramCode = projects
        .flatMap((project) => project?.children ?? [])
        .find((child) => child.uuid === uuid)?.code;
  
      // Create the Mermaid file if diagramCode is found
      if (diagramCode) {
        const diagramId = uuid;
        const processedCode = ensureConfigBlock(diagramCode, diagramId);
        createMermaidFile(context, processedCode, true);
      } else {
        vscode.window.showErrorMessage("Diagram not found for the given UUID.");
      }
    })
  );

context.subscriptions.push(
  vscode.commands.registerCommand('mermaid.editAuxFile', async (uri: vscode.Uri, range: vscode.Range) => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const fileExt = path.extname(document.fileName);
      const blockContent = content.substring(document.offsetAt(range.start), document.offsetAt(range.end));
      
      const mermaidCode = extractMermaidCode(blockContent, fileExt).join("\n\n");
      
      if (!mermaidCode) {
        vscode.window.showErrorMessage("No valid Mermaid diagram found in the selected range.");
        return;
      }
      
      const editor = await createMermaidFile(context, mermaidCode, true);
      if (editor) {
        syncAuxFile(editor.document.uri.toString(), uri, range);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error processing Mermaid diagram: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    }
  })
);

  context.subscriptions.push(
  vscode.commands.registerCommand('mermaid.connectDiagram',async(uri: vscode.Uri, range:vscode.Range)=>{
    try{
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const fileExt = path.extname(document.fileName);
      const blockContent = content.substring(document.offsetAt(range.start), document.offsetAt(range.end));
      const diagramCode = extractMermaidCode(blockContent, fileExt).join("\n\n");
      const projects = getAllTreeViewProjectsCache();

      const selectedProject = await vscode.window.showQuickPick(
        projects.map((p) => ({ label: p.title, description: p.title, projectId: p.uuid })),
        { placeHolder: "Select a project to save the diagram" }
      );
      
      if (!selectedProject || !selectedProject?.projectId) {
          vscode.window.showInformationMessage("Operation cancelled.");
          return;
      }
      
      const response = await mcAPI.createDocumentWithDiagram(diagramCode, selectedProject.projectId)

      const processedCode = ensureConfigBlock(diagramCode, response.documentID);
       const editor= await await createMermaidFile(context, processedCode, true);
       if(editor){
        syncAuxFile(editor.document.uri.toString(), uri,range);
      }
    } catch(error){
      if (error instanceof Error ) {
      const errMessage = error.message; 
      const matchedError = Object.keys(customErrorMessage).find((key) =>errMessage.includes(key));
      vscode.window.showErrorMessage(matchedError ? customErrorMessage[matchedError] : `Error: ${errMessage}`);
      } else {
      vscode.window.showErrorMessage("Unknown error occurred.");
      }
    }
    })
  )
 
  vscode.workspace.onWillSaveTextDocument(async (event) => {
    if (event.document.languageId.startsWith("mermaid")) {
      event.waitUntil(Promise.resolve([]));
      const content = event.document.getText();
      const diagramId = extractIdFromCode(content);
      if (diagramId) {
          await mcAPI.saveDocumentCode(content, diagramId);
      }
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.syncDiagramWithMermaid', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        syncFileToMermaidChart(editor.document);
      }
    })
  );
  const syncFileToMermaidChart = async (document: vscode.TextDocument) => {
    if (document.languageId.startsWith("mermaid")) {
        const content = document.getText();
        try {
            const diagramId = extractIdFromCode(content);
            if (TempFileCache.hasTempUri(context, document.uri.toString()) && diagramId) {
                await mcAPI.saveDocumentCode(content, diagramId);
                vscode.window.showInformationMessage(`Diagram synced successfully with Mermaid chart. Diagram ID: ${diagramId}`);
            } else if (TempFileCache.hasTempUri(context, document.uri.toString())){
              vscode.window.showInformationMessage('This is temporary buffer, this can not be saved locally');
          } else if (!TempFileCache.hasTempUri(context, document.uri.toString()) && diagramId) {
              await vscode.commands.executeCommand('workbench.action.files.save');
                await mcAPI.saveDocumentCode(content, diagramId);
                vscode.window.showInformationMessage(`Diagram synced successfully with Mermaid chart. Diagram ID: ${diagramId}`);
            } else {
              await vscode.commands.executeCommand('workbench.action.files.save');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to sync file: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
        }
    }
};

context.subscriptions.push(
  vscode.commands.registerCommand('mermaid.connectDiagramToMermaidChart', async () => {
    const activeEditor = vscode.window.activeTextEditor;
    const document = activeEditor?.document;

    if (!document) {
      vscode.window.showErrorMessage("No active document found.");
      return;
    }

    const content = document.getText();
    
    // Check if the document is already connected
    if (hasConfigId(content)) {
      vscode.window.showWarningMessage("This diagram is already connected to Mermaid Chart.");
      return;
    }

    const projects = getAllTreeViewProjectsCache();
    const selectedProject = await vscode.window.showQuickPick(
      projects.map((p) => ({ label: p.title, description: p.title, projectId: p.uuid })),
      { placeHolder: "Select a project to save the diagram" }
    );

    if (!selectedProject || !selectedProject.projectId) {
      vscode.window.showInformationMessage("Operation cancelled.");
      return;
    }

    const response = await mcAPI.createDocumentWithDiagram(content, selectedProject.projectId);

    const processedCode = ensureConfigBlock(content, response.documentID);

    // Apply the new processedCode to the document
    await activeEditor.edit((editBuilder) => {
      const fullRange = new vscode.Range(
        activeEditor.document.positionAt(0),
        activeEditor.document.positionAt(content.length)
      );
      editBuilder.replace(fullRange, processedCode);
    });

    PreviewPanel.createOrShow(document);
  })
);

  vscode.commands.registerCommand("mermaidChart.downloadDiagram", async (item: Document) => {
    if (!item || !item.code) {
      vscode.window.showErrorMessage("No code found for this diagram.");
      return;
    }
    const processedCode = ensureConfigBlock(item.code, item.uuid);
    createMermaidFile(context, processedCode, false)
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.focus", () => {
      const emptyMermaidChartToken: MCTreeItem = {
        uuid: "",
        title: "",
        code : "",
        range: new vscode.Range(0, 0, 0, 0),
      };
      treeView.reveal(emptyMermaidChartToken, {
        select: false,
        focus: true,
        expand: false,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.refresh", () => {
      mermaidChartProvider.refresh();
 
    })
  );

  let disposable = vscode.commands.registerCommand(
    "mermaidChart.outline",
    () => {
      vscode.window.registerTreeDataProvider(
        "mermaidChart",
        mermaidChartProvider
      );
    }
  );
  context.subscriptions.push(disposable);

const insertUuidIntoEditorDisposable = vscode.commands.registerCommand(
  "mermaidChart.insertUuidIntoEditor",
  ({ uuid }: MCTreeItem) =>
      uuid ? insertMermaidChartToken(uuid, mermaidChartProvider) 
           : vscode.window.showErrorMessage("Invalid item selected. No UUID found.")
);

  context.subscriptions.push(insertUuidIntoEditorDisposable);

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.refreshTreeView", () => {
      mermaidChartProvider.refresh();
    })
  );

  mermaidChartProvider.refresh();

  const provider = vscode.languages.registerCompletionItemProvider(
    [
      { scheme: 'file' },
      { scheme: 'untitled' }
    ],
    {
        provideCompletionItems(document, position, token, context) {
            const languageId = document.languageId.toLowerCase();

            // Ensure the languageId is exactly "mermaid" or starts with "mermaid"
            if (!(languageId === 'mermaid' || languageId.startsWith('mermaid'))) {
                return [];
            }

            const snippets = getSnippetsBasedOnDiagram(languageId);

            const suggestions: vscode.CompletionItem[] = snippets.map(snippet => {
                const item = new vscode.CompletionItem(
                    snippet.id,
                    vscode.CompletionItemKind.Snippet
                );
                item.insertText = new vscode.SnippetString(snippet.completion);
                item.documentation = new vscode.MarkdownString(
                    `**${snippet.name}**\n\n\`\`\`mermaid\n${snippet.sample}\n\`\`\``
                );
                return item;
            });

            return suggestions;
        },
    },
    'm'
);

context.subscriptions.push(provider);

  console.log("Mermaid Charts view registered");
}

// This method is called when your extension is deactivated
export function deactivate() {}

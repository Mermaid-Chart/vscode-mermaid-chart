import * as vscode from "vscode";
import type MarkdownIt from 'markdown-it';
import { MermaidChartProvider, MCTreeItem, getAllTreeViewProjectsCache, getProjectIdForDocument, Document, getDiagramFromCache, updateDiagramInCache } from "./mermaidChartProvider";
import { MermaidChartVSCode } from "./mermaidChartVSCode";
import { DiagramManager } from "./diagramManager";
import {
  applyMermaidChartTokenHighlighting,
  configSection,
  editMermaidChart,
  ensureAuthenticated,
  findComments,
  findDiagramCode,
  findMermaidChartTokens,
  findMermaidChartTokensFromAuxFiles,
  flattenProjects,
  getDiagramTemplates,
  getHelpUrl,
  getMermaidChartTokenDecoration,
  insertMermaidChartToken,
  isAuxFile,
  MermaidChartToken,
  syncAuxFile,
  triggerSuggestIfEmpty,
  updateViewVisibility,
  viewMermaidChart,
} from "./util";
import { MermaidChartCodeLensProvider } from "./mermaidChartCodeLensProvider";
import { createMermaidFile, getPreview, openMermaidPreview } from "./commands/createFile";
import { canOpenMermaidPreview } from "./util";
import { generateDiagramFromActiveFile } from "./commands/generateDiagram";
import { repairAndSaveToCloud } from "./commands/repairAndSaveToCloud";
import { SuggestionsPanel, showSuggestionsTab } from "./panels/suggestionsPanel";
import { handleTextDocumentChange } from "./eventHandlers";
import { TempFileCache } from "./cache/tempFileCache";
import { PreviewPanel } from "./panels/previewPanel";
import { getSnippetsBasedOnDiagram } from "./constants/condSnippets";
import { ensureIdField, extractIdFromCode, getFirstWordFromDiagram, normalizeMermaidText } from "./frontmatter";
import { customErrorMessage } from "./constants/errorMessages";
import { MermaidWebviewProvider } from "./panels/loginPanel";
import analytics from "./analytics";
import { RemoteSyncHandler } from "./remoteSyncHandler";
import { registerRegenerateCommand } from './commercial/sync/regenerateCommand';
import { initializeAIChatParticipant } from "./commercial/ai/chatParticipant";
import {
  setPreviewBridge,
  registerTools,
  setValidationBridge,
  setDiagramDiffBridge,
  initializePlugin,
} from "@mermaid-chart/vscode-utils";;
import { PreviewBridgeImpl } from "./commercial/ai/tools/previewTool";
import { ValidationBridgeImpl } from "./commercial/ai/tools/validationTool";
import { openDiagramDiffWebviews } from "./commercial/sync/diagramDiffView";
import { injectMermaidTheme } from "./previewmarkdown/themeing";
import { extendMarkdownItWithMermaid } from "./previewmarkdown/shared-md-mermaid";
import * as packageJson from '../package.json'; 
import { clearTmLanguageCache } from "./syntaxHighlighter";
import { MermaidChartAuthenticationProvider } from "./mermaidChartAuthenticationProvider";
import { openChatWithMermaidMention } from "./chat/openMermaidChatMention";
import { registerLanguageModelExtensionContext } from "./services/vscodeLanguageModel";
import { GitTrailerDetector } from "./commercial/prReview/gitTrailerDetector";
import { BotEditCodeLensProvider, OPEN_REVIEW_COMMAND } from "./commercial/prReview/botEditCodeLensProvider";
import { BotEditFileDecorationProvider } from "./commercial/prReview/botEditFileDecorationProvider";
import { BotEditContentProvider } from "./commercial/prReview/botEditContentProvider";
import { openReview, registerReviewCommands } from "./commercial/prReview/openReview";
import {
  PendingReviewTreeProvider,
  registerPendingReviewCommands,
} from "./commercial/prReview/pendingReviewTreeProvider";


const pluginID = (packageJson.name === "vscode-mermaid-chart" || packageJson.name === "vscode-mermaid-chart-test")
  ? "MERMAIDCHART_VS_CODE_PLUGIN"
  : "MERMAID_PREVIEW_VS_CODE_PLUGIN";
let diagramMappings: { [key: string]: string[] } = require('../src/diagramTypeWords.json');
let isExtensionStarted = false;
let isAPIInitialized = false;


export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating Mermaid Chart extension");

  // Register PR Review providers FIRST — before any code that could throw
  // and before the long-running mcAPI.initialize() call. This guarantees the
  // bot-edit banner / tab dot / review command always come up.
  try {
    console.log("[PR Review] === activating PR review feature (build May4 v9 — slice 2.5 + commit edits) ===");
    const botEditDetector = new GitTrailerDetector();
    const botEditCodeLensProvider = new BotEditCodeLensProvider(botEditDetector);
    const botEditFileDecorationProvider = new BotEditFileDecorationProvider(botEditDetector);
    const botEditContentProvider = new BotEditContentProvider();
    const pendingReviewTreeProvider = new PendingReviewTreeProvider(botEditDetector);
    console.log("[PR Review] providers instantiated; registering with VS Code…");

    // Context key drives the editor/title toolbar buttons. Re-evaluate whenever
    // the active editor changes or the detector's cache is invalidated.
    const refreshHasBotEditCtx = async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (!uri || uri.scheme !== "file") {
        await vscode.commands.executeCommand(
          "setContext",
          "mermaidChart.prReview.hasBotEdit",
          false,
        );
        return;
      }
      const info = await botEditDetector.detect(uri);
      await vscode.commands.executeCommand(
        "setContext",
        "mermaidChart.prReview.hasBotEdit",
        Boolean(info),
      );
    };
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => refreshHasBotEditCtx()),
      botEditDetector.onDidChange(() => refreshHasBotEditCtx()),
    );
    refreshHasBotEditCtx();
    context.subscriptions.push(
      botEditDetector,
      botEditCodeLensProvider,
      botEditFileDecorationProvider,
      botEditContentProvider,
      vscode.languages.registerCodeLensProvider(
        [
          { language: "mermaid" },
          { pattern: "**/*.mmd" },
          { pattern: "**/*.mermaid" },
        ],
        botEditCodeLensProvider,
      ),
      vscode.window.registerFileDecorationProvider(botEditFileDecorationProvider),
      pendingReviewTreeProvider,
      vscode.window.registerTreeDataProvider(
        "mermaidSyncPendingReview",
        pendingReviewTreeProvider,
      ),
      ...registerReviewCommands(context, botEditDetector, botEditContentProvider),
      ...registerPendingReviewCommands(),
      vscode.commands.registerCommand(OPEN_REVIEW_COMMAND, async (uri?: vscode.Uri) => {
        console.log("[PR Review] openReview command invoked, uri arg =", uri?.fsPath ?? "<none>");
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        console.log("[PR Review] resolved target =", target?.fsPath ?? "<none>");
        if (!target) {
          vscode.window.showWarningMessage("PR Review: no active editor — open a .mmd file first.");
          return;
        }
        await openReview(context, botEditDetector, botEditContentProvider, target);
      }),
    );
    console.log("[PR Review] registration complete");
  } catch (err) {
    console.error("[PR Review] FAILED to register providers:", err);
  }

  registerLanguageModelExtensionContext(context);

  vscode.commands.executeCommand("setContext", "mermaid.showWebview", true);

  initializePlugin(pluginID);

  analytics.trackActivation();

  try {
    registerTools(context);
    setPreviewBridge(new PreviewBridgeImpl());
    setValidationBridge(new ValidationBridgeImpl());
    setDiagramDiffBridge({ openDiagramDiffWebviews });
  } catch (err) {
    console.warn("[MermaidExtension] LM tool registration skipped:", err);
  }

  try {
    initializeAIChatParticipant(context);
  } catch (err) {
    console.warn("[MermaidExtension] Chat participant skipped:", err);
  }

  const mermaidWebviewProvider = new MermaidWebviewProvider(context);

  const mcAPI = new MermaidChartVSCode();
  
  // Set the API instance for PreviewPanel to use for repair functionality
  PreviewPanel.setExtensionPath(context.extensionPath);
  PreviewPanel.setMcAPI(mcAPI);
  // Create global RemoteSyncHandler instance
  const remoteSyncHandler = new RemoteSyncHandler(mcAPI);
  context.subscriptions.push({
    dispose: () => remoteSyncHandler.dispose()
  });
  
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.login', async () => {
      try {
        await mcAPI.login();
        analytics.trackLogin();
      } catch (err) {
        console.error("[MermaidExtension] Login failed:", err);
        updateViewVisibility(false, mermaidWebviewProvider, mermaidChartProvider);
        vscode.commands.executeCommand("mermaidWebview.focus");
      }
    })
  );

  // Add manual token validation command
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.validateManualToken', async (token: string) => {
      await mcAPI.loginWithToken(token);
      analytics.trackLogin();
    })
  );

  const mermaidChartProvider: MermaidChartProvider = new MermaidChartProvider(
    mcAPI
  );

  const suggestionsPanel = new SuggestionsPanel(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("mermaidWebview", mermaidWebviewProvider)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SuggestionsPanel.viewType, suggestionsPanel)
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      suggestionsPanel.analyzeCurrent();
    })
  );

  // Register preview and editor commands BEFORE mcAPI.initialize() so they
  // always work even if the API/auth setup hangs or fails.
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.preview', getPreview)
  );

  DiagramManager.registerCommands(context, mcAPI, mermaidChartProvider);

  function tryOpenPreviewForActiveDiagram(editor: vscode.TextEditor | undefined) {
    if (!editor) {
      return;
    }
    const autoOpen = vscode.workspace
      .getConfiguration()
      .get<boolean>("mermaidChart.openPreviewOnOpen", false);
    if (!autoOpen || !canOpenMermaidPreview(editor.document)) {
      return;
    }
    PreviewPanel.createOrShow(editor.document);
  }

  const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && !isExtensionStarted) {
        isExtensionStarted = true;
        handleTextDocumentChange(activeEditor, diagramMappings, true);
    }

  vscode.workspace.onDidChangeTextDocument((event) =>
    {
      handleTextDocumentChange(event, diagramMappings, false);
      updateMermaidChartTokenHighlighting();
      triggerSuggestIfEmpty(event.document);
    },
    null,
    context.subscriptions
  );

  vscode.window.onDidChangeActiveTextEditor(
    (event) => {
      handleTextDocumentChange(event, diagramMappings, true);
      updateMermaidChartTokenHighlighting();
      tryOpenPreviewForActiveDiagram(event);
    },
    null,
    context.subscriptions
  );

  setTimeout(() => tryOpenPreviewForActiveDiagram(vscode.window.activeTextEditor ?? undefined), 0);

  // Run API initialization and session restoration in the background so the
  // activate() function returns promptly. VS Code only renders our Sign-in
  // webview AFTER activate() resolves; awaiting auth here causes the panel
  // to show the loading spinner forever (especially if the macOS keychain
  // or the auth provider stalls).
  void (async () => {
    const API_INIT_TIMEOUT_MS = 15000;
    try {
      await Promise.race([
        mcAPI.initialize(context, mermaidWebviewProvider, mermaidChartProvider),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("API initialization timed out")), API_INIT_TIMEOUT_MS)
        ),
      ]);
      console.log("[MermaidExtension] API initialized successfully");
      isAPIInitialized = true;
    } catch (err) {
      console.error("[MermaidExtension] mcAPI.initialize() failed — local features still work:", err);
      isAPIInitialized = false;
      mcAPI.clearInitializing();
    }

    try {
      // getSession can hang on macOS if the keychain prompt is unresponsive.
      // A bounded race guarantees activation never deadlocks the Sign-in UI.
      const restoredSession = await Promise.race([
        vscode.authentication.getSession(
          MermaidChartAuthenticationProvider.id,
          [],
          { silent: true }
        ),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5000)),
      ]);

      let isLoggedInFromSession = false;

      if (restoredSession && isAPIInitialized) {
        try {
          await Promise.race([
            mcAPI.getUser(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("session validation timeout")), 5000)
            ),
          ]);
          isLoggedInFromSession = true;
        } catch {
          console.log("[MermaidExtension] Stored session is invalid/expired — clearing");
          try {
            const authProvider = MermaidChartAuthenticationProvider.getInstance(mcAPI, context);
            await authProvider.removeSession(restoredSession.id);
          } catch { /* best-effort cleanup */ }
          mcAPI.resetAccessToken();
        }
      }

      await context.globalState.update("isUserLoggedIn", isLoggedInFromSession);
      updateViewVisibility(isLoggedInFromSession, mermaidWebviewProvider, mermaidChartProvider);

      if (!isLoggedInFromSession) {
        setTimeout(() => vscode.commands.executeCommand("mermaidWebview.focus"), 300);
      }
    } catch (err) {
      console.error("[MermaidExtension] Session restore failed:", err);
      updateViewVisibility(false, mermaidWebviewProvider, mermaidChartProvider);
      setTimeout(() => vscode.commands.executeCommand("mermaidWebview.focus"), 300);
    }
  })();
  
  vscode.commands.registerCommand('mermaidChart.createMermaidFile', async () => {
    createMermaidFile(context, null, false);
  });
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidChart.logout', async () => {
      mcAPI.logout(context);
    })
  );

 let  mermaidChartTokenDecoration: vscode.TextEditorDecorationType;
  mermaidChartTokenDecoration = getMermaidChartTokenDecoration();
  vscode.window.onDidChangeActiveColorTheme(() => {
    mermaidChartTokenDecoration.dispose(); 
    mermaidChartTokenDecoration = getMermaidChartTokenDecoration(); 
  });
  


    const mermaidChartGutterIconDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(context.asAbsolutePath("images/mermaid-icon.svg")), // Add the icon file path
      gutterIconSize: "8x8",// Adjust the icon size as desired
    });
  let codeLensProvider: MermaidChartCodeLensProvider | undefined;

  function updateMermaidChartTokenHighlighting() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      let mermaidChartTokens : MermaidChartToken[] = [];
      if (!isAuxFile(activeEditor.document.fileName)) {
        const comments = findComments(activeEditor.document);
        mermaidChartTokens = findMermaidChartTokens(
          activeEditor.document,
          comments
        );

      applyMermaidChartTokenHighlighting(
        activeEditor,
        mermaidChartTokens,
        mermaidChartTokenDecoration,
        mermaidChartGutterIconDecoration,
        false
      );

      } else {
        mermaidChartTokens = findMermaidChartTokensFromAuxFiles(activeEditor.document);
        applyMermaidChartTokenHighlighting(
          activeEditor,
          mermaidChartTokens,
          mermaidChartTokenDecoration,
          mermaidChartGutterIconDecoration,
          true
        );
      }

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


  const viewCommandDisposable = vscode.commands.registerCommand(
    "mermaidChart.viewMermaidChart",
    (uuid: string) => {
      console.log("Viewing Mermaid Chart with UUID: ", uuid);
      return viewMermaidChart(mcAPI, uuid);
    }
  );

  context.subscriptions.push(viewCommandDisposable);

  const treeView = vscode.window.createTreeView("mermaidChart", {
    treeDataProvider: mermaidChartProvider,
  });
  vscode.window.registerTreeDataProvider("mermaidChart", mermaidChartProvider);

  async function revealMermaidPanel() {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true }
    );
    if (!session) {
      await vscode.commands.executeCommand("mermaidWebview.focus");
      return;
    }
    await vscode.commands.executeCommand("mermaidChart.focus");
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.openSidebar", revealMermaidPanel)
  );

  const editCommandDisposable = vscode.commands.registerCommand(
    "extension.editMermaidChart",
    (uuid: string) => {
      return editMermaidChart(mcAPI, uuid, mermaidChartProvider);
    }
  );
  context.subscriptions.push(editCommandDisposable);

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.editLocally", async (uuid: string) => {
      if (!(await ensureAuthenticated())) {
        return;
      }
      let projects = getAllTreeViewProjectsCache();
      if (projects.length === 0) {
        if(MermaidChartProvider.isSyncing) {
          await MermaidChartProvider.waitForSync();
        } else {
          vscode.window.showInformationMessage('Please wait, diagrams are being synchronized...');
          await mermaidChartProvider.syncMermaidChart();
        }
        projects = getAllTreeViewProjectsCache();
    }
   
      // Find the diagram code based on the UUID
       const diagramCode = findDiagramCode(projects,uuid);
        
      // Create the Mermaid file if diagramCode is found
      if (diagramCode) {
      const diagramId = uuid;
      const processedCode = ensureIdField(diagramCode, diagramId);
      const projectId = getProjectIdForDocument(diagramId);

      if (projectId) {
        await mcAPI.setDocument({
          documentID: diagramId,
          projectID: projectId,
          code: processedCode,
        });
        updateDiagramInCache(diagramId, processedCode);
      }
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
      const blockContent = content.substring(document.offsetAt(range.start), document.offsetAt(range.end));
      const normalizedContent = normalizeMermaidText(blockContent);
      
      if (!normalizedContent) {
        vscode.window.showErrorMessage("No valid Mermaid diagram found in the selected range.");
        return;
      }
      
      const editor = await createMermaidFile(context, normalizedContent, true);
      if (editor) {
        syncAuxFile(editor.document.uri.toString(), uri, range);
      }
    } catch (error) {
      analytics.trackException(error);
      vscode.window.showErrorMessage(`Error processing Mermaid diagram: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    }
  })
);
 
context.subscriptions.push(
  vscode.commands.registerCommand('mermaid.connectDiagram', async (uri: vscode.Uri, range: vscode.Range) => {
    if (!(await ensureAuthenticated())) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();
    const blockContent = content.substring(document.offsetAt(range.start), document.offsetAt(range.end)).trim();
    if(MermaidChartProvider.isSyncing) {
      await MermaidChartProvider.waitForSync();
    }
    const projects = getAllTreeViewProjectsCache();
    let flattenedProjects = flattenProjects(projects);
    if (flattenedProjects.length === 0) {
      vscode.window.showInformationMessage('Please wait, diagrams are being synchronized...');
      await mermaidChartProvider.syncMermaidChart();
      const updatedProjects = getAllTreeViewProjectsCache();
      flattenedProjects = flattenProjects(updatedProjects);
    }
    if (flattenedProjects.length === 0) {
      vscode.window.showInformationMessage('No projects available to connect the diagram. Please try again later.');
      return;
    }
    const selectedProject = await vscode.window.showQuickPick(
      flattenedProjects.map((p) => ({ label: p.title, description: p.title, projectId: p.uuid })),
      { placeHolder: "Select a project to save the diagram" }
    );

    if (!selectedProject || !selectedProject?.projectId) {
      vscode.window.showInformationMessage("Operation cancelled.");
      return;
    }

    try {
      const newDocument = await mcAPI.createDocument(selectedProject.projectId);

      if (!newDocument || !newDocument.documentID) {
        vscode.window.showErrorMessage("Failed to create a new document.");
        return;
      }

      const normalizedContent = normalizeMermaidText(blockContent);
      const processedCode = ensureIdField(normalizedContent, newDocument.documentID);
      await mcAPI.setDocument({
        documentID: newDocument.documentID,
        projectID: selectedProject.projectId,
        code: processedCode,
      });
      mermaidChartProvider.syncMermaidChart();
      const editor = await createMermaidFile(context, processedCode, true);

      if (editor) {
        syncAuxFile(editor.document.uri.toString(), uri, range);
      }
    } catch (error) {
      if (error instanceof Error ) {
        const errMessage = error.message; 
        const matchedError = Object.keys(customErrorMessage).find((key) =>errMessage.includes(key));
        vscode.window.showErrorMessage(matchedError ? customErrorMessage[matchedError] : `Error: ${errMessage}`);
        } else {
        vscode.window.showErrorMessage("Unknown error occurred.");
        }
        analytics.trackException(error);
      }
  })
);

vscode.workspace.onWillSaveTextDocument(async (event) => {
  if (event.reason !== vscode.TextDocumentSaveReason.Manual) {
    if (event.document.languageId.startsWith("mermaid")) {
      return;
    }
  }
  if (event.document.languageId.startsWith("mermaid")) {
    const content = event.document.getText();
    const diagramId = extractIdFromCode(content);
    if (diagramId) {
      const projectId = getProjectIdForDocument(diagramId);

      if (projectId) {

      const syncDecision = await remoteSyncHandler.handleRemoteChanges(
        event.document,
          diagramId
      );

      if (syncDecision === 'abort') {
          // vscode.window.showInformationMessage('Sync cancelled');
          return;
      }
      // Proceed with saving
      await mcAPI.setDocument({
        documentID: diagramId,
        projectID: projectId,
        code: content,
      });

      // Update the cache with the new code immediately after successful save
      updateDiagramInCache(diagramId, content);
      vscode.window.showInformationMessage(`Diagram synced successfully with Mermaid chart. Diagram ID: ${diagramId}`);
      }
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
  const syncFileToMermaidChart = async (document: vscode.TextDocument): Promise<void> => {
    // Early return if not a mermaid file
    if (!document.languageId.startsWith("mermaid")) {
        vscode.window.showInformationMessage('This file is not a Mermaid diagram.');
        return;
    }

    if (MermaidChartProvider.isSyncing) {
        vscode.window.showInformationMessage('Please wait, diagrams are being synchronized...');
        await MermaidChartProvider.waitForSync();
    }

    const content = document.getText();
    
    // Early return if content is empty
    if (!content.trim()) {
        vscode.window.showInformationMessage('The file is empty.');
        return;
    }

    try {
        const diagramId = extractIdFromCode(content);
        const tempUri = document.uri.toString();

        // Check if this file actually needs syncing
        const needsSync = TempFileCache.hasTempUri(context, tempUri) && diagramId;

        if (needsSync) {
            // Only show sync popup for files that actually need syncing
        const progressPromise = vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing diagram with Mermaid Chart...',
            cancellable: false
        }, async (progress) => {
                const projectId = getProjectIdForDocument(diagramId);
                if (!projectId) {
                    vscode.window.showErrorMessage('No project ID found for this diagram.');
                    return;
                }

                progress.report({ message: 'Checking for remote changes...' });
                
                // Create a promise that resolves when remote sync is complete
                const syncDecision = await remoteSyncHandler.handleRemoteChanges(
                    document,
                    diagramId
                );

                if (syncDecision === 'abort') {
                    return;
                }

                progress.report({ message: 'Saving changes...' });
                
                await mcAPI.setDocument({
                    documentID: diagramId,
                    projectID: projectId,
                    code: document.getText(),
                });

                updateDiagramInCache(diagramId, document.getText());

                vscode.window.showInformationMessage(
                    `Diagram synced successfully with Mermaid Chart.`
                );
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Sync operation timed out')), 100000);
        });

            await Promise.race([progressPromise, timeoutPromise]);
        } else {
            // For local files or temp files without IDs, just save normally
            if (TempFileCache.hasTempUri(context, tempUri) && !diagramId) {
                vscode.window.showInformationMessage('This is a temporary buffer, it cannot be saved locally');
                return;
            }
            
            // Normal save for local files
            await vscode.commands.executeCommand('workbench.action.files.save');
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred.";
        analytics.trackException(error);
        vscode.window.showErrorMessage(`Failed to sync file: ${errorMessage}`);
    }
};

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.connectDiagramToMermaidChart', async () => {
    const activeEditor = vscode.window.activeTextEditor;
    const document = activeEditor?.document;

    if (!document) {
      vscode.window.showErrorMessage("No active document found.");
      return;
    }

    const content = document.getText();
    const id = extractIdFromCode(content);
    
    // Check if the document is already connected
    if (id) {
      vscode.window.showWarningMessage("This diagram is already connected to Mermaid Chart.");
      return;
    }
    if(MermaidChartProvider.isSyncing) {
      await MermaidChartProvider.waitForSync();
    }
    const projects = getAllTreeViewProjectsCache();
    let flattenedProjects = flattenProjects(projects);
    if (flattenedProjects.length === 0) {
      vscode.window.showInformationMessage('Please wait, diagrams are being synchronized...');
      await mermaidChartProvider.syncMermaidChart();
      const updatedProjects = getAllTreeViewProjectsCache();
      flattenedProjects = flattenProjects(updatedProjects);
    }
    if (flattenedProjects.length === 0) {
      vscode.window.showInformationMessage('No projects available to connect the diagram. Please try again later.');
      return;
    }

    const selectedProject = await vscode.window.showQuickPick(
      flattenedProjects.map((p) => ({ label: p.title, description: p.title, projectId: p.uuid })),
      { placeHolder: "Select a project to save the diagram" }
    );

    if (!selectedProject || !selectedProject.projectId) {
      vscode.window.showInformationMessage("Operation cancelled.");
      return;
    }

    try {
    const newDocument = await mcAPI.createDocument(selectedProject.projectId);

    if (!newDocument || !newDocument.documentID) {
      vscode.window.showErrorMessage("Failed to create a new document.");
      return;
    }

    const processedCode = ensureIdField(content, newDocument.documentID);
    await mcAPI.setDocument({
      documentID: newDocument.documentID,
      projectID: selectedProject.projectId,
      code: processedCode,
    });
    mermaidChartProvider.syncMermaidChart();

    // Apply the new processedCode to the document
    await activeEditor.edit((editBuilder) => {
      const fullRange = new vscode.Range(
        activeEditor.document.positionAt(0),
        activeEditor.document.positionAt(content.length)
      );
      editBuilder.replace(fullRange, processedCode);
    });

    PreviewPanel.createOrShow(document);
    vscode.window.showInformationMessage(`Diagram connected successfully with Mermaid chart.`);
    }   catch(error) {
      if (error instanceof Error ) {
        const errMessage = error.message;
        const matchedError = Object.keys(customErrorMessage).find((key) =>errMessage.includes(key));
        vscode.window.showErrorMessage(matchedError ? customErrorMessage[matchedError] : `Error: ${errMessage}`);
        } else {
        vscode.window.showErrorMessage("Unknown error occurred.");
        }
        analytics.trackException(error);
    }

  })
);

  vscode.commands.registerCommand(
    "mermaidChart.useDiagram",
    async (item: Document) => {
      if (!(await ensureAuthenticated())) {
        return;
      }
      if (!item || !item.code) {
        vscode.window.showErrorMessage("No code found for this diagram.");
        return;
      }

      const projectId = getProjectIdForDocument(item.uuid);
      if (!projectId) {
        vscode.window.showErrorMessage("No project ID found for this diagram.");
        return;
      }
      const processedCode = ensureIdField(item.code, item.uuid);
      await mcAPI.setDocument({
        documentID: item.uuid,
        projectID: projectId,
        code: processedCode,
      });
      updateDiagramInCache(item.uuid, processedCode);
      createMermaidFile(context, processedCode, false);
    },
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

context.subscriptions.push(
  vscode.commands.registerCommand("mermaidChart.diagramHelp", () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
          const documentText = activeEditor.document.getText();
          const firstWord = getFirstWordFromDiagram(documentText);
          const helpUrl = getHelpUrl(firstWord);
          vscode.env.openExternal(vscode.Uri.parse(helpUrl));
      } else {
          vscode.window.showWarningMessage("No active editor found.");
      }
  })
);

  const provider = vscode.languages.registerCompletionItemProvider(
    [
      { scheme: 'file' },
      { scheme: 'untitled' }
    ],
    {
        provideCompletionItems(document, position, token, context) {
            const languageId = document.languageId.toLowerCase();
            if (document.getText().trim() === "") {
              return;
            }
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

  // const triggerCompletions = vscode.commands.registerCommand(
  //   'mermaidChart.showCompletions',
  //   () => {
  //       const editor = vscode.window.activeTextEditor;
  //       if (editor) {
  //           vscode.commands.executeCommand('editor.action.triggerSuggest');
  //       }
  //   }
  // );

  // context.subscriptions.push(provider, triggerCompletions);

  console.log("Mermaid Charts view registered");

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.openCopilotChat", async () => {
      await openChatWithMermaidMention({ suffix: "", submit: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.generateCloudDiagram", async () => {
      await openChatWithMermaidMention({
        suffix: " /generate_cloud_architecture_diagram",
        submit: true,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.generateERDiagram", async () => {
      await openChatWithMermaidMention({
        suffix: " /generate_er_diagram",
        submit: true,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidChart.generateDockerDiagram", async () => {
      await openChatWithMermaidMention({
        suffix: " /generate_docker_diagram",
        submit: true,
      });
    })
  );

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.openResponsePreview', async (mermaidCode: string) => {
    if (!mermaidCode) {
      vscode.window.showErrorMessage("No Mermaid code provided");
      return;
    }
    await openMermaidPreview(context, mermaidCode);
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.generateDiagram', async () => {
    await generateDiagramFromActiveFile(context);
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.repairAndSaveToCloud', async () => {
    await repairAndSaveToCloud();
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.improveDiagram', async (uri?: vscode.Uri) => {
    if (uri) {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
    await showSuggestionsTab(context.extensionUri);
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('mermaidChart.copyDiagramLink', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !canOpenMermaidPreview(editor.document)) {
      vscode.window.showErrorMessage("Open a .mmd file to copy its diagram link.");
      return;
    }
    const code = editor.document.getText();
    const link = `https://mermaid.live/edit#base64:${Buffer.from(code).toString("base64")}`;
    await vscode.env.clipboard.writeText(link);
    vscode.window.showInformationMessage("Diagram link copied to clipboard (mermaid.live)");
  })
);

context.subscriptions.push(
  vscode.languages.registerCompletionItemProvider(
    [
      { scheme: 'file' },
      { scheme: 'untitled' }
    ],
    {
      provideCompletionItems(document) {
        if (document.getText().trim() === "") {
          const templates = getDiagramTemplates();
          const templateEntries = Object.entries(templates);

          const suggestions = templateEntries.map(([name, code]) => {
            const item = new vscode.CompletionItem(
              name,
              vscode.CompletionItemKind.Snippet
            );
            item.insertText = new vscode.SnippetString(code);
            item.documentation = new vscode.MarkdownString(
              `**${name}**\n\n\`\`\`mermaid\n${code}\n\`\`\``
            );
            return item;
          });
          return suggestions;
        }
        return [];
      },
    },
  )
);
vscode.workspace.onDidOpenTextDocument((document) => {
  triggerSuggestIfEmpty(document);
});
vscode.window.visibleTextEditors.forEach((editor) => {
  triggerSuggestIfEmpty(editor.document);
});

// Register markdown preview handler
context.subscriptions.push(
  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === 'markdown') {
      const content = document.getText();
      if (content.includes('```mermaid')) {
        // This will ensure our custom preview script is loaded
        vscode.commands.executeCommand('markdown.preview.refresh');
      }
    }
  })
);
context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration(configSection) || e.affectsConfiguration('workbench.colorTheme')) {
      vscode.commands.executeCommand('markdown.preview.refresh');
  }
}));

// Register the regenerate command from commercial directory
registerRegenerateCommand(context, mcAPI);

context.subscriptions.push(
  vscode.commands.registerCommand(
    'mermaidChart.openDiagramDiffWebviews',
    (oldContent: string, newContent: string) => {
      if (typeof oldContent !== 'string' || typeof newContent !== 'string') {
        console.warn('[Mermaid Diagram Diff] Invalid args:', { oldContent: typeof oldContent, newContent: typeof newContent });
        vscode.window.showErrorMessage('Diagram diff requires old and new content.');
        return;
      }
      try {
        openDiagramDiffWebviews(oldContent, newContent);
      } catch (err) {
        console.error('[Mermaid Diagram Diff] Command handler error:', err);
        vscode.window.showErrorMessage(
          `Diagram diff failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  )
);

return {
  extendMarkdownIt(md: MarkdownIt) {
      extendMarkdownItWithMermaid(md, {
          languageIds: () => {
              return vscode.workspace.getConfiguration(configSection).get<string[]>('languages', ['mermaid']);
          }
      });
      md.use(injectMermaidTheme);
      return md;
  }
};
}

// This method is called when your extension is deactivated
export function deactivate() {
  clearTmLanguageCache();
}

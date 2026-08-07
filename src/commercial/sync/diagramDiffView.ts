import * as path from "path";
import * as vscode from "vscode";
import * as os from "node:os";
import * as crypto from "crypto";
import { splitFrontMatter } from "../../frontmatter";
import { setupDiagramDiffPreview } from "../../diagramDiffPreview";
import { debounce } from "../../utils/debounce";
import { getWebviewHTML, ReviewDiagramPreviewContext } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";
import { buildReviewChromeLiveUpdate } from "./reviewChrome";
import {
  calculateDiagramDiff,
  computeReviewSurfaceDiff,
  createHighlightInstructions,
  type DiagramChangeItem,
  type DiagramDiffCounts,
  type HighlightInstruction,
  type ReviewSurfaceDiff,
} from "./diagramDiffHighlighter";
import { getThemeColors } from "../../../webview/src/themes/themeConfig";
import { saveDiagramAsPng, saveDiagramAsSvg } from "../../services/renderService";
import analytics from "../../analytics";
import { prepareMermaidDiffDocuments } from "../../syntaxHighlighter";

const diagramTypeWords: Record<string, string[]> = require("../../diagramTypeWords.json");
const EXTENSION_ID = `${packageJson.publisher}.${packageJson.name}`;

let cachedExtensionPath: string | undefined;

/** Set from `extension.ts` activate so webviews resolve assets in F5 and production. */
export function setReviewDiagramExtensionPath(extensionPath: string): void {
  cachedExtensionPath = extensionPath;
}

function resolveExtensionPath(): string | undefined {
  if (cachedExtensionPath) {
    return cachedExtensionPath;
  }
  const extPath = vscode.extensions.getExtension(EXTENSION_ID)?.extensionPath;
  if (extPath) {
    cachedExtensionPath = extPath;
  }
  return extPath;
}

function previewWebviewOptions(extensionPath: string) {
  return {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.file(path.join(extensionPath, "out")),
      vscode.Uri.file(path.join(extensionPath, "media")),
    ],
  };
}

function readPreviewLimits(): { maxZoom: number; maxCharLength: number; maxEdges: number } {
  const config = vscode.workspace.getConfiguration();
  return {
    maxZoom: config.get<number>("mermaid.vscode.maxZoom", 5),
    maxCharLength: config.get<number>("mermaid.vscode.maxCharLength", 90000),
    maxEdges: config.get<number>("mermaid.vscode.maxEdges", 1000),
  };
}

export interface DiagramDiffWebviewOptions {
  currentRepairDocumentUri?: vscode.Uri;
  incomingRepairDocumentUri?: vscode.Uri;
}

function pushPreviewContent(panel: vscode.WebviewPanel | undefined, fullText: string): void {
  if (!panel) {
    return;
  }
  const { diagramText } = splitFrontMatter(fullText);
  panel.webview.postMessage({ type: "update", content: diagramText });
}

function wirePreviewDocumentSync(
  panel: vscode.WebviewPanel | undefined,
  sourceUri: vscode.Uri | undefined,
  disposables: vscode.Disposable[],
): void {
  if (!panel || !sourceUri) {
    return;
  }
  const sourceKey = sourceUri.toString();
  const refresh = debounce((text: string) => pushPreviewContent(panel, text), 300);
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== sourceKey) {
        return;
      }
      refresh(event.document.getText());
    }),
  );
}

/** Post highlights after webview boots — early posts are dropped (18MB bundle). */
function createHighlightSender(
  panel: vscode.WebviewPanel,
  getInstructions: () => HighlightInstruction[],
  disposables: vscode.Disposable[],
): () => void {
  let rendered = false;

  const post = (): void => {
    const highlights = getInstructions();
    if (!rendered || highlights.length === 0) {
      return;
    }
    void panel.webview.postMessage({ type: "applyHighlights", highlights });
  };

  // App.svelte already re-applies stored highlights on each render; ack is enough.
  disposables.push(
    panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message?.type === "diagramRendered") {
        rendered = true;
        post();
      }
    }),
  );

  return post;
}

/** Review chrome — green/amber/red CSS + stagger via previewTemplate inline script. */
function postReviewHighlightNodes(
  panel: vscode.WebviewPanel | undefined,
  phase: "now" | "before",
  nodeIds: {
    addedNodeIds: string[];
    modifiedNodeIds: string[];
    removedNodeIds: string[];
  },
): void {
  if (!panel) {
    return;
  }
  const isNow = phase === "now";
  panel.webview.postMessage({
    type: "highlightNodes",
    phase,
    addedNodeIds: isNow ? nodeIds.addedNodeIds : [],
    modifiedNodeIds: nodeIds.modifiedNodeIds,
    removedNodeIds: isNow ? [] : nodeIds.removedNodeIds,
  });
}

function wireReviewHighlightRepost(
  panel: vscode.WebviewPanel,
  getPhase: () => "now" | "before",
  getNodeIds: () => {
    addedNodeIds: string[];
    modifiedNodeIds: string[];
    removedNodeIds: string[];
  },
): void {
  const repost = (): void => {
    if (panel.visible) {
      postReviewHighlightNodes(panel, getPhase(), getNodeIds());
    }
  };
  panel.onDidChangeViewState(repost);
}

function formatReviewPanelTitle(counts: DiagramDiffCounts, fileName: string): string {
  const countParts: string[] = [];
  if (counts.added > 0) { countParts.push(`${counts.added} added`); }
  if (counts.modified > 0) { countParts.push(`${counts.modified} changed`); }
  if (counts.removed > 0) { countParts.push(`${counts.removed} removed`); }
  return countParts.length ? `After · ${countParts.join(", ")}` : `After · ${fileName}`;
}

type ReviewDiagramLiveState = {
  newDiagramText: string;
  oldDiagramText: string;
  fullNewContent: string;
  nodeHighlightIds: {
    addedNodeIds: string[];
    modifiedNodeIds: string[];
    removedNodeIds: string[];
  };
  surface: Pick<ReviewSurfaceDiff, "counts" | "changes" | "astAvailable">;
};

function applySurfaceToLiveState(
  state: ReviewDiagramLiveState,
  oldContent: string,
  newContent: string,
  surface: ReviewSurfaceDiff,
): void {
  const { diagramText: newDiagramText } = splitFrontMatter(newContent);
  const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
  state.newDiagramText = newDiagramText;
  state.oldDiagramText = oldDiagramText;
  state.fullNewContent = newContent;
  state.nodeHighlightIds.addedNodeIds = surface.addedNodeIds;
  state.nodeHighlightIds.modifiedNodeIds = surface.modifiedNodeIds;
  state.nodeHighlightIds.removedNodeIds = surface.removedNodeIds;
  state.surface.counts = surface.counts;
  state.surface.changes = surface.changes;
  state.surface.astAvailable = surface.astAvailable;
}

function postReviewChromeUpdate(
  panel: vscode.WebviewPanel | undefined,
  counts: DiagramDiffCounts,
  changes: DiagramChangeItem[],
): void {
  if (!panel) {
    return;
  }
  const patch = buildReviewChromeLiveUpdate(counts, changes);
  panel.webview.postMessage({
    type: "updateReviewChrome",
    summaryHtml: patch.summaryHtml,
    changesHtml: patch.changesHtml,
  });
}

export interface ReviewDiagramPreviewOptions {
  counts: DiagramDiffCounts;
  changes: DiagramChangeItem[];
  addedNodeIds: string[];
  modifiedNodeIds: string[];
  removedNodeIds: string[];
  astAvailable: boolean;
  oldContent: string;
  fileName: string;
  fileUri?: vscode.Uri;
  reviewRef?: string;
  onCompareSideBySide?: () => void;
  onViewDiffCode?: () => void;
}

/**
 * Open the diagram diff view: two separate webviews (Before and After), each with
 * full preview UI (zoom, pan, theme, export).
 *
 * Opt-in path — app review default uses {@link openReviewDiagramPreview}
 * (single surface with Now/Before toggle) instead.
 *
 * Returns a dispose function — call it to close both preview panels programmatically.
 */
export function openDiagramDiffWebviews(
  oldContent: string,
  newContent: string,
  options?: DiagramDiffWebviewOptions,
): () => void {
  analytics.trackOpenDiagramDiff();
  let panelCurrent: vscode.WebviewPanel | undefined;
  let panelUpdated: vscode.WebviewPanel | undefined;
  const disposables: vscode.Disposable[] = [];
  let newDiagramInstructions: HighlightInstruction[] = [];
  let oldDiagramInstructions: HighlightInstruction[] = [];
  let sendUpdatedHighlights: (() => void) | undefined;
  let sendCurrentHighlights: (() => void) | undefined;

  const disposePanels = (): void => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    disposables.length = 0;
    panelCurrent?.dispose();
    panelUpdated?.dispose();
    panelCurrent = undefined;
    panelUpdated = undefined;
  };

  const openPanels = (oldDiagramText: string, newDiagramText: string): void => {
    panelCurrent = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffCurrent",
      "Before",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panelUpdated = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffUpdated",
      "After",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    setupDiagramDiffPreview(
      panelCurrent,
      oldDiagramText,
      options?.currentRepairDocumentUri,
      disposables,
    );
    setupDiagramDiffPreview(
      panelUpdated,
      newDiagramText,
      options?.incomingRepairDocumentUri,
      disposables,
    );

    wirePreviewDocumentSync(panelCurrent, options?.currentRepairDocumentUri, disposables);
    wirePreviewDocumentSync(panelUpdated, options?.incomingRepairDocumentUri, disposables);

    sendCurrentHighlights = createHighlightSender(
      panelCurrent,
      () => oldDiagramInstructions,
      disposables,
    );
    sendUpdatedHighlights = createHighlightSender(
      panelUpdated,
      () => newDiagramInstructions,
      disposables,
    );

    void vscode.commands.executeCommand("vscode.setEditorLayout", {
      orientation: 0,
      groups: [
        { size: 0.5 },
        {
          groups: [{ size: 0.5 }, { size: 0.5 }],
          size: 0.5,
          orientation: 1,
        },
      ],
    });
  };

  try {
    const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);

    openPanels(oldDiagramText, newDiagramText);

    void calculateDiagramDiff(oldDiagramText, newDiagramText)
      .then(createHighlightInstructions)
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error({ err: msg }, "[Mermaid Diagram Diff] AST diff failed; previews open without highlights");
        return {
          newDiagramInstructions: [] as HighlightInstruction[],
          oldDiagramInstructions: [] as HighlightInstruction[],
        };
      })
      .then((instructions) => {
        newDiagramInstructions = instructions.newDiagramInstructions;
        oldDiagramInstructions = instructions.oldDiagramInstructions;
        // Covers the case where the webview finished rendering before the diff resolved.
        sendUpdatedHighlights?.();
        sendCurrentHighlights?.();
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Diagram Diff] Error opening diagram diff view:", err);
    vscode.window.showErrorMessage(`Diagram diff view failed: ${msg}`);
  }

  return disposePanels;
}

/**
 * App-review diagram surface: full-size Now diagram, summary chips, changes list,
 * Now/Before toggle. Removed nodes appear in the list only — not on the Now diagram.
 */
export async function openReviewDiagramPreview(
  options: ReviewDiagramPreviewOptions,
  newContent: string,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
): Promise<{
  panel: vscode.WebviewPanel | undefined;
  dispose: () => void;
  refreshFromContent: (updatedContent: string) => Promise<void>;
}> {
  let panel: vscode.WebviewPanel | undefined;
  let currentPhase: "now" | "before" = "now";
  let pendingReviewHighlights = true;
  let themeBootstrapSent = false;
  const messageDisposables: vscode.Disposable[] = [];
  const limits = readPreviewLimits();

  const liveState: ReviewDiagramLiveState = {
    newDiagramText: "",
    oldDiagramText: "",
    fullNewContent: newContent,
    nodeHighlightIds: {
      addedNodeIds: options.addedNodeIds,
      modifiedNodeIds: options.modifiedNodeIds,
      removedNodeIds: options.removedNodeIds,
    },
    surface: {
      counts: options.counts,
      changes: options.changes,
      astAvailable: options.astAvailable,
    },
  };

  const dispose = (): void => {
    for (const disposable of messageDisposables) {
      disposable.dispose();
    }
    messageDisposables.length = 0;
    panel?.dispose();
    panel = undefined;
  };

  const flushReviewHighlights = (): void => {
    if (!pendingReviewHighlights) {
      return;
    }
    pendingReviewHighlights = false;
    postReviewHighlightNodes(panel, currentPhase, liveState.nodeHighlightIds);
  };

  const refreshFromContent = async (updatedContent: string): Promise<void> => {
    if (!panel) {
      return;
    }
    const surface = await computeReviewSurfaceDiff(options.oldContent, updatedContent);
    applySurfaceToLiveState(liveState, options.oldContent, updatedContent, surface);
    options.addedNodeIds.length = 0;
    options.addedNodeIds.push(...surface.addedNodeIds);
    options.modifiedNodeIds.length = 0;
    options.modifiedNodeIds.push(...surface.modifiedNodeIds);
    options.removedNodeIds.length = 0;
    options.removedNodeIds.push(...surface.removedNodeIds);
    options.counts = surface.counts;
    options.changes = surface.changes;
    options.astAvailable = surface.astAvailable;

    panel.title = formatReviewPanelTitle(surface.counts, options.fileName);
    postReviewChromeUpdate(panel, surface.counts, surface.changes);

    if (currentPhase === "now") {
      pendingReviewHighlights = true;
      panel.webview.postMessage({
        type: "update",
        content: liveState.newDiagramText,
        isFileChange: true,
        maxZoom: limits.maxZoom,
        maxCharLength: limits.maxCharLength,
        maxEdge: limits.maxEdges,
      });
    }
  };

  try {
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);
    const { diagramText: oldDiagramText } = splitFrontMatter(options.oldContent);
    liveState.newDiagramText = newDiagramText;
    liveState.oldDiagramText = oldDiagramText;

    const extensionPath = resolveExtensionPath();
    if (!extensionPath) {
      console.error("[Mermaid Review Diagram] Unable to resolve extension path");
      vscode.window.showErrorMessage(
        "Review diagram could not load extension assets. Run npm run compile, then restart the Extension Development Host (F5).",
      );
      return { panel, dispose, refreshFromContent };
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;
    const vscodeThemeName = config.get<string>("workbench.colorTheme", "Default Light+");
    const vscodeThemeColors = getThemeColors(vscodeThemeName);

    const title = formatReviewPanelTitle(options.counts, options.fileName);

    const reviewCtx: ReviewDiagramPreviewContext = {
      counts: options.counts,
      changes: options.changes,
      addedNodeIds: options.addedNodeIds,
      modifiedNodeIds: options.modifiedNodeIds,
      removedNodeIds: options.removedNodeIds,
      reviewRef: options.reviewRef,
      currentTheme: theme,
      vscodeThemeName,
      fileName: options.fileName,
      beforeDiagramText: oldDiagramText,
      highlightCapability: options.astAvailable ? "ast" : "none",
    };

    panel = vscode.window.createWebviewPanel(
      "mermaidReviewDiagramPreview",
      title,
      viewColumn,
      previewWebviewOptions(extensionPath),
    );
    panel.webview.html = getWebviewHTML(
      panel,
      extensionPath,
      newDiagramText,
      theme,
      false,
      undefined,
      undefined,
      undefined,
      reviewCtx,
    );

    wireReviewHighlightRepost(panel, () => currentPhase, () => liveState.nodeHighlightIds);

    messageDisposables.push(
      wireReviewDiagramMessages(
        panel,
        options,
        () => liveState.newDiagramText,
        () => liveState.oldDiagramText,
        theme,
        vscodeThemeName,
        vscodeThemeColors,
        () => currentPhase,
        (phase) => { currentPhase = phase; },
        {
          onCompareSideBySide: options.onCompareSideBySide,
          onViewDiffCode: options.onViewDiffCode,
          onDiagramRendered: () => {
            if (!themeBootstrapSent) {
              themeBootstrapSent = true;
              panel?.webview.postMessage({
                type: "update",
                vscodeThemeName,
                vscodeThemeColors,
                isFileChange: false,
              });
            }
            flushReviewHighlights();
          },
          onPhaseSwitch: () => {
            pendingReviewHighlights = true;
          },
        },
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Review Diagram] Failed to open preview:", err);
    vscode.window.showErrorMessage(`Mermaid preview failed: ${msg}`);
  }

  return { panel, dispose, refreshFromContent };
}

function wireReviewDiagramMessages(
  panel: vscode.WebviewPanel,
  options: ReviewDiagramPreviewOptions,
  getNewDiagramText: () => string,
  getOldDiagramText: () => string,
  initialTheme: string,
  vscodeThemeName: string,
  vscodeThemeColors: ReturnType<typeof getThemeColors>,
  getPhase: () => "now" | "before",
  setPhase: (p: "now" | "before") => void,
  hooks: {
    onCompareSideBySide?: () => void;
    onViewDiffCode?: () => void;
    onDiagramRendered: () => void;
    onPhaseSwitch: () => void;
  },
): vscode.Disposable {
  let currentTheme = initialTheme;
  const limits = readPreviewLimits();

  return panel.webview.onDidReceiveMessage(async (message: {
    type?: string;
    phase?: string;
    nodeId?: string;
    theme?: string;
    pngBase64?: string;
    svgBase64?: string;
    message?: string;
  }) => {
    if (!message?.type) { return; }

    if (message.type === "diagramRendered") {
      hooks.onDiagramRendered();
      return;
    }

    if (message.type === "exportPng" && message.pngBase64) {
      if (!options.fileUri) {
        vscode.window.showErrorMessage("Cannot export: no diagram file is associated with this review.");
        return;
      }
      const doc = await vscode.workspace.openTextDocument(options.fileUri);
      const diagramCode = getPhase() === "now" ? getNewDiagramText() : getOldDiagramText();
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Exporting PNG...",
        cancellable: false,
      }, async () => {
        await saveDiagramAsPng(doc, message.pngBase64!, diagramCode);
      });
      return;
    }

    if (message.type === "exportSvg" && message.svgBase64) {
      if (!options.fileUri) {
        vscode.window.showErrorMessage("Cannot export: no diagram file is associated with this review.");
        return;
      }
      const doc = await vscode.workspace.openTextDocument(options.fileUri);
      const diagramCode = getPhase() === "now" ? getNewDiagramText() : getOldDiagramText();
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Exporting SVG...",
        cancellable: false,
      }, async () => {
        await saveDiagramAsSvg(doc, message.svgBase64!, diagramCode);
      });
      return;
    }

    if (message.type === "error" && message.message) {
      vscode.window.showErrorMessage(message.message);
      return;
    }

    if (message.type === "switchPhase" && (message.phase === "now" || message.phase === "before")) {
      if (getPhase() === message.phase) { return; }
      setPhase(message.phase);
      const content = message.phase === "now" ? getNewDiagramText() : getOldDiagramText();

      hooks.onPhaseSwitch();
      panel.webview.postMessage({
        type: "update",
        content,
        isFileChange: true,
        fade: true,
        maxZoom: limits.maxZoom,
        maxCharLength: limits.maxCharLength,
        maxEdge: limits.maxEdges,
      });
      panel.webview.postMessage({ type: "resetInitialZoom" });
      return;
    }

    if (message.type === "setTheme" && message.theme) {
      currentTheme = message.theme;
      const content = getPhase() === "now" ? getNewDiagramText() : getOldDiagramText();
      panel.webview.postMessage({
        type: "update",
        content,
        currentTheme,
        isFileChange: true,
        maxZoom: limits.maxZoom,
        maxCharLength: limits.maxCharLength,
        maxEdge: limits.maxEdges,
      });
      return;
    }

    if (message.type === "openExport") {
      panel.webview.postMessage({ type: "openExportModal" });
      return;
    }

    if (message.type === "viewDiffCode") {
      hooks.onViewDiffCode?.();
      return;
    }

    if (message.type === "focusChange" && message.nodeId) {
      panel.webview.postMessage({ type: "focusNode", nodeId: message.nodeId });
      return;
    }

    if (message.type === "compareSideBySide") {
      hooks.onCompareSideBySide?.();
    }
  });
}

export interface OpenAppReviewDiagramOptions {
  reviewRef?: string;
  onViewDiffCode?: () => void;
  /**
   * When true, Diff code save writes the proposal into `fileUri`
   * (regenerate — proposal is not in the file yet).
   */
  applyProposalOnDiffSave?: boolean;
}

export interface OpenTemporaryCodeDiffOptions {
  /** When set, saving the after/right side applies that text into this document. */
  applyToUri?: vscode.Uri;
  /** Called after a successful apply-to-file from Diff code save. */
  onApplied?: (text: string) => void;
}

/**
 * Opens a disposable vscode.diff for old vs new content (line-diff / Diff code).
 * Creates `.mmd` temps, applies Mermaid syntax highlighting, optional apply-on-save.
 */
export async function openTemporaryCodeDiff(
  oldContent: string,
  newContent: string,
  title: string,
  options?: OpenTemporaryCodeDiffOptions,
): Promise<() => void> {
  const id = crypto.randomBytes(6).toString("hex");
  const sessionDir = path.join(os.tmpdir(), "vscode-mermaid-chart-diff", id);
  const sessionDirUri = vscode.Uri.file(sessionDir);
  const originalTempUri = vscode.Uri.file(path.join(sessionDir, "before.mmd"));
  const updatedTempUri = vscode.Uri.file(path.join(sessionDir, "after.mmd"));

  await vscode.workspace.fs.createDirectory(sessionDirUri);
  await vscode.workspace.fs.writeFile(originalTempUri, Buffer.from(oldContent, "utf8"));
  await vscode.workspace.fs.writeFile(updatedTempUri, Buffer.from(newContent, "utf8"));

  // prepareMermaidDiffDocuments swallows per-uri errors; never throws to here.
  await prepareMermaidDiffDocuments([originalTempUri, updatedTempUri], diagramTypeWords);

  await vscode.commands.executeCommand("vscode.diff", originalTempUri, updatedTempUri, title, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    saveDisposable?.dispose();
    void vscode.workspace.fs.delete(sessionDirUri, { recursive: true }).then(undefined, () => undefined);
  };

  let saveDisposable: vscode.Disposable | undefined;
  const applyToUri = options?.applyToUri;
  const canApply =
    !!applyToUri &&
    (applyToUri.scheme === "file" || applyToUri.scheme === "untitled");

  if (applyToUri && !canApply) {
    console.error(
      { scheme: applyToUri.scheme, uri: applyToUri.toString() },
      "Refusing Diff code applyToUri — only file/untitled schemes are allowed",
    );
  }

  if (canApply && applyToUri) {
    const targetUri = applyToUri;
    saveDisposable = vscode.workspace.onDidSaveTextDocument(async (saved) => {
      if (saved.uri.toString() !== updatedTempUri.toString()) {
        return;
      }
      try {
        const text = saved.getText();
        const targetDoc = await vscode.workspace.openTextDocument(targetUri);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          targetUri,
          new vscode.Range(0, 0, targetDoc.lineCount, 0),
          text,
        );
        await vscode.workspace.applyEdit(edit);
        options?.onApplied?.(text);
        vscode.window.showInformationMessage("Saved changes from Diff code applied successfully");
      } catch (error) {
        console.error({ err: error }, "Failed to apply Diff code save to diagram file");
        vscode.window.showErrorMessage(
          `Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  const tabWatcher = vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
    for (const tab of closed) {
      if (!(tab.input instanceof vscode.TabInputTextDiff)) {
        continue;
      }
      const { original, modified } = tab.input;
      if (
        original.toString() === originalTempUri.toString() &&
        modified.toString() === updatedTempUri.toString()
      ) {
        tabWatcher.dispose();
        cleanup();
        return;
      }
    }
  });

  return () => {
    tabWatcher.dispose();
    cleanup();
  };
}

/**
 * Entry point for Mermaid Sync app review ("Review changes"): opens the review
 * diagram webview with chrome, AST diff + review chrome highlights, and optional side-by-side diff.
 *
 * Also used by remote-sync + regenerate (PLUG-81) via the diagram-diff bridge.
 */
export async function openAppReviewDiagramSurface(
  fileUri: vscode.Uri,
  oldContent: string,
  newContent: string,
  surfaceOptions: OpenAppReviewDiagramOptions = {},
): Promise<{
  closePanels: () => void;
  panel: vscode.WebviewPanel | undefined;
  refreshFromContent: (updatedContent: string) => Promise<void>;
}> {
  const surfaceDiff = await computeReviewSurfaceDiff(oldContent, newContent);
  const fileName = path.basename(fileUri.fsPath);

  if (!surfaceDiff.astAvailable) {
    vscode.window.showWarningMessage(
      "Diagram element highlights aren't available for this diagram type. Use Diff code for a line-by-line comparison.",
    );
  }

  const contentRefs = { oldContent, newContent };
  let splitDispose: (() => void) | undefined;
  let codeDiffDispose: (() => void) | undefined;
  let panelAlreadyDisposed = false;
  let previewRef: Awaited<ReturnType<typeof openReviewDiagramPreview>> | undefined;

  const openSideBySide = (): void => {
    splitDispose?.();
    splitDispose = openDiagramDiffWebviews(contentRefs.oldContent, contentRefs.newContent);
  };

  const openDiffCode =
    surfaceOptions.onViewDiffCode ??
    (() => {
      void openTemporaryCodeDiff(
        contentRefs.oldContent,
        contentRefs.newContent,
        `Diagram Diff: ${fileName}`,
        surfaceOptions.applyProposalOnDiffSave
          ? {
              applyToUri: fileUri,
              onApplied: (text) => {
                contentRefs.newContent = text;
                void previewRef?.refreshFromContent(text);
              },
            }
          : undefined,
      ).then((dispose) => {
        codeDiffDispose?.();
        codeDiffDispose = dispose;
      });
    });

  const preview = await openReviewDiagramPreview(
    {
      counts: surfaceDiff.counts,
      changes: surfaceDiff.changes,
      addedNodeIds: surfaceDiff.addedNodeIds,
      modifiedNodeIds: surfaceDiff.modifiedNodeIds,
      removedNodeIds: surfaceDiff.removedNodeIds,
      astAvailable: surfaceDiff.astAvailable,
      oldContent,
      fileName,
      fileUri,
      reviewRef: surfaceOptions.reviewRef,
      onCompareSideBySide: openSideBySide,
      onViewDiffCode: openDiffCode,
    },
    newContent,
    vscode.ViewColumn.Active,
  );
  previewRef = preview;

  preview.panel?.reveal(vscode.ViewColumn.Active, false);
  preview.panel?.onDidDispose(() => {
    panelAlreadyDisposed = true;
  });

  if (!preview.panel) {
    vscode.window.showErrorMessage(
      `Review diagram failed to open for ${fileName}. Run npm run compile and restart the Extension Development Host.`,
    );
  }

  const closePanels = (): void => {
    if (!panelAlreadyDisposed) {
      try {
        preview.dispose();
      } catch {
        /* best-effort */
      }
      panelAlreadyDisposed = true;
    }
    try {
      splitDispose?.();
    } catch {
      /* best-effort */
    }
    try {
      codeDiffDispose?.();
    } catch {
      /* best-effort */
    }
    splitDispose = undefined;
    codeDiffDispose = undefined;
  };

  const refreshFromContent = async (updatedContent: string): Promise<void> => {
    contentRefs.newContent = updatedContent;
    await preview.refreshFromContent(updatedContent);
  };

  return { closePanels, panel: preview.panel, refreshFromContent };
}

import * as path from "path";
import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { getWebviewHTML, ReviewDiagramPreviewContext } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";
import {
    buildChangeList,
    diffNodes,
    DiagramChangeItem,
    DiagramCodeDiffFocus,
    DiagramDiffCounts,
    summarizeNodeDiff,
} from "./diagramNodeDiff";
import {
  calculateDiagramDiff,
  createHighlightInstructions,
  resolveDiagramHighlightCapability,
  type HighlightInstruction,
} from "./diagramDiffHighlighter";
import { getThemeColors } from "../../../webview/src/themes/themeConfig";

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

export interface DiagramDiffHighlightOptions {
  /** Node identifiers present only in `newContent` — outlined green on the after panel. */
  addedNodeIds: string[];
  /** Node identifiers whose declarations changed — outlined amber on the after panel. */
  modifiedNodeIds: string[];
  /** Node identifiers present only in `oldContent` — changes list / counts only. */
  removedNodeIds: string[];
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

export interface ReviewDiagramPreviewOptions extends DiagramDiffHighlightOptions {
  counts: DiagramDiffCounts;
  changes: DiagramChangeItem[];
  oldContent: string;
  fileName: string;
  reviewRef?: string;
  themeLabel?: string;
  onCompareSideBySide?: () => void;
  /** Opens native vscode.diff (PLUG-72) — wired from Diff code / View code in review chrome. */
  onViewDiffCode?: (focus?: DiagramCodeDiffFocus) => void;
}

/**
 * Open the diagram diff view: two separate webviews (Current and Updated), each with
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
  highlightOptions?: DiagramDiffHighlightOptions,
): () => void {
  let panelCurrent: vscode.WebviewPanel | undefined;
  let panelUpdated: vscode.WebviewPanel | undefined;

  const disposePanels = (): void => {
    panelCurrent?.dispose();
    panelUpdated?.dispose();
    panelCurrent = undefined;
    panelUpdated = undefined;
  };

  const openPanels = async (
    oldDiagramText: string,
    newDiagramText: string,
    newDiagramInstructions: HighlightInstruction[],
    oldDiagramInstructions: HighlightInstruction[]
  ): Promise<void> => {
    const extensionPath = resolveExtensionPath();
    if (!extensionPath) {
      console.error("[Mermaid Diagram Diff] Unable to resolve extension path");
      vscode.window.showErrorMessage("Unable to resolve extension path for diagram diff.");
      return;
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;

    panelCurrent = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffCurrent",
      "Before",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panelCurrent.webview.html = getWebviewHTML(
      panelCurrent,
      extensionPath,
      oldDiagramText,
      theme,
      false,
    );

    panelUpdated = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffUpdated",
      "Now",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panelUpdated.webview.html = getWebviewHTML(
      panelUpdated,
      extensionPath,
      newDiagramText,
      theme,
      false,
      undefined,
      undefined,
      highlightOptions,
      undefined,
    );

    if (highlightOptions) {
      wireHighlightRepost(panelUpdated, highlightOptions);
    }

    if (newDiagramInstructions.length > 0 || oldDiagramInstructions.length > 0) {
      setTimeout(() => {
        if (newDiagramInstructions.length > 0) {
          panelUpdated?.webview.postMessage({
            type: "applyHighlights",
            highlights: newDiagramInstructions,
          });
        }
        if (oldDiagramInstructions.length > 0) {
          panelCurrent?.webview.postMessage({
            type: "applyHighlights",
            highlights: oldDiagramInstructions,
          });
        }
      }, 1000);
    }

    setTimeout(() => {
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
    }, 150);
  };

  try {
    const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);

    void calculateDiagramDiff(oldDiagramText, newDiagramText)
      .then(async (diagramDiff) => {
        const { newDiagramInstructions, oldDiagramInstructions } =
          await createHighlightInstructions(diagramDiff);
        await openPanels(oldDiagramText, newDiagramText, newDiagramInstructions, oldDiagramInstructions);
      })
      .catch(async (error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error({ err: msg }, "[Mermaid Diagram Diff] AST diff failed; opening previews without highlights");
        vscode.window.showWarningMessage(`Diagram diff highlights unavailable: ${msg}`);
        await openPanels(oldDiagramText, newDiagramText, [], []);
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
 * Now/Before toggle. Removed nodes appear in the list only — not on the diagram.
 */
export async function openReviewDiagramPreview(
  options: ReviewDiagramPreviewOptions,
  newContent: string,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
): Promise<{ panel: vscode.WebviewPanel | undefined; dispose: () => void }> {
  let panel: vscode.WebviewPanel | undefined;
  let currentPhase: "now" | "before" = "now";

  const dispose = (): void => {
    panel?.dispose();
    panel = undefined;
  };

  try {
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);
    const { diagramText: oldDiagramText } = splitFrontMatter(options.oldContent);

    const extensionPath = resolveExtensionPath();
    if (!extensionPath) {
      console.error("[Mermaid Review Diagram] Unable to resolve extension path");
      vscode.window.showErrorMessage(
        "Review diagram could not load extension assets. Run npm run compile, then restart the Extension Development Host (F5).",
      );
      return { panel, dispose };
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;
    const themeLabel = formatThemeLabel(theme);
    const vscodeThemeName = config.get<string>("workbench.colorTheme", "Default Light+");
    const vscodeThemeColors = getThemeColors(vscodeThemeName);

    const titleParts = ["After"];
    const countParts: string[] = [];
    if (options.counts.added > 0) { countParts.push(`${options.counts.added} added`); }
    if (options.counts.modified > 0) { countParts.push(`${options.counts.modified} changed`); }
    if (options.counts.removed > 0) { countParts.push(`${options.counts.removed} removed`); }
    const title = countParts.length
      ? `${titleParts[0]} · ${countParts.join(", ")}`
      : `${titleParts[0]} · ${options.fileName}`;

    let highlightCapability: "ast" | "none" = "none";
    try {
      const cap = await resolveDiagramHighlightCapability(newDiagramText);
      highlightCapability = cap.mode;
    } catch {
      highlightCapability = "none";
    }

    const reviewCtx: ReviewDiagramPreviewContext = {
      counts: options.counts,
      changes: options.changes,
      addedNodeIds: options.addedNodeIds,
      modifiedNodeIds: options.modifiedNodeIds,
      removedNodeIds: options.removedNodeIds,
      reviewRef: options.reviewRef,
      themeLabel,
      currentTheme: theme,
      vscodeThemeName,
      fileName: options.fileName,
      beforeDiagramText: oldDiagramText,
      highlightCapability,
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

    wireHighlightRepost(panel, options);
    wireReviewDiagramMessages(
      panel,
      options,
      newDiagramText,
      oldDiagramText,
      theme,
      options.fileName,
      () => currentPhase,
      (p) => { currentPhase = p; },
      options.onCompareSideBySide,
      options.onViewDiffCode,
    );

    const limits = readPreviewLimits();
    const sendInitialDiagram = (): void => {
      panel?.webview.postMessage({
        type: "update",
        content: newDiagramText,
        currentTheme: theme,
        vscodeThemeName,
        vscodeThemeColors,
        isFileChange: true,
        maxZoom: limits.maxZoom,
        maxCharLength: limits.maxCharLength,
        maxEdge: limits.maxEdges,
      });
    };
    const sendInitialHighlights = (): void => {
      panel?.webview.postMessage({
        type: "highlightNodes",
        phase: "now",
        addedNodeIds: options.addedNodeIds,
        modifiedNodeIds: options.modifiedNodeIds,
        removedNodeIds: [],
      });
    };
    setTimeout(sendInitialDiagram, 100);
    setTimeout(sendInitialDiagram, 600);
    setTimeout(sendInitialHighlights, 950);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Review Diagram] Failed to open preview:", err);
    vscode.window.showErrorMessage(`Mermaid preview failed: ${msg}`);
  }

  return { panel, dispose };
}

function wireHighlightRepost(
  panel: vscode.WebviewPanel | undefined,
  highlightOptions?: DiagramDiffHighlightOptions,
): void {
  if (!panel || !highlightOptions) {
    return;
  }
  const hasHighlights =
    (highlightOptions.addedNodeIds?.length ?? 0) > 0 ||
    (highlightOptions.modifiedNodeIds?.length ?? 0) > 0 ||
    (highlightOptions.removedNodeIds?.length ?? 0) > 0;
  if (!hasHighlights) {
    return;
  }
  const repost = (): void => {
    if (panel?.visible) {
      panel.webview.postMessage({
        type: "highlightNodes",
        addedNodeIds: highlightOptions.addedNodeIds ?? [],
        modifiedNodeIds: highlightOptions.modifiedNodeIds ?? [],
        removedNodeIds: highlightOptions.removedNodeIds ?? [],
      });
    }
  };
  panel.onDidChangeViewState(repost);
  setTimeout(repost, 200);
  setTimeout(repost, 800);
}

function wireReviewDiagramMessages(
  panel: vscode.WebviewPanel,
  highlightOptions: DiagramDiffHighlightOptions,
  newDiagramText: string,
  oldDiagramText: string,
  initialTheme: string,
  fileName: string,
  getPhase: () => "now" | "before",
  setPhase: (p: "now" | "before") => void,
  onCompareSideBySide?: () => void,
  onViewDiffCode?: (focus?: DiagramCodeDiffFocus) => void,
): void {
  let currentTheme = initialTheme;
  const limits = readPreviewLimits();

  panel.webview.onDidReceiveMessage((message: {
    type?: string;
    phase?: string;
    nodeId?: string;
    kind?: string;
    changeLabel?: string;
    theme?: string;
  }) => {
    if (!message?.type) { return; }

    if (message.type === "switchPhase" && (message.phase === "now" || message.phase === "before")) {
      if (getPhase() === message.phase) { return; }
      setPhase(message.phase);
      const content = message.phase === "now" ? newDiagramText : oldDiagramText;
      const isNow = message.phase === "now";

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
      setTimeout(() => {
        panel.webview.postMessage({
          type: "highlightNodes",
          phase: isNow ? "now" : "before",
          addedNodeIds: isNow ? highlightOptions.addedNodeIds : [],
          modifiedNodeIds: highlightOptions.modifiedNodeIds,
          removedNodeIds: isNow ? [] : (highlightOptions.removedNodeIds ?? []),
        });
      }, 280);
      return;
    }

    if (message.type === "setTheme" && message.theme) {
      currentTheme = message.theme;
      const content = getPhase() === "now" ? newDiagramText : oldDiagramText;
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
      onViewDiffCode?.();
      return;
    }

    if (message.type === "focusChange" && message.nodeId) {
      panel.webview.postMessage({ type: "focusNode", nodeId: message.nodeId });
      return;
    }

    if (message.type === "compareSideBySide") {
      onCompareSideBySide?.();
    }
  });
}

function formatThemeLabel(theme: string): string {
  return theme
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface OpenAppReviewDiagramOptions {
  reviewRef?: string;
  onViewDiffCode?: (focus?: DiagramCodeDiffFocus) => void;
}

/**
 * Entry point for Mermaid Sync app review ("Review changes"): opens the review
 * diagram webview with chrome, node highlights, and optional side-by-side diff.
 */
export async function openAppReviewDiagramSurface(
  fileUri: vscode.Uri,
  oldContent: string,
  newContent: string,
  surfaceOptions: OpenAppReviewDiagramOptions = {},
): Promise<{ closePanels: () => void; panel: vscode.WebviewPanel | undefined }> {
  const nodeDiff = diffNodes(oldContent, newContent);
  const counts = summarizeNodeDiff(nodeDiff);
  const changes = buildChangeList(oldContent, newContent, nodeDiff);
  const fileName = path.basename(fileUri.fsPath);

  let splitDispose: (() => void) | undefined;
  const openSideBySide = (): void => {
    splitDispose?.();
    splitDispose = openDiagramDiffWebviews(oldContent, newContent, {
      addedNodeIds: nodeDiff.addedNodeIds,
      modifiedNodeIds: nodeDiff.modifiedNodeIds,
      removedNodeIds: nodeDiff.removedNodeIds,
    });
  };

  console.log("[App Review] Opening review diagram surface", { fileName, counts });

  const preview = await openReviewDiagramPreview(
    {
      addedNodeIds: nodeDiff.addedNodeIds,
      modifiedNodeIds: nodeDiff.modifiedNodeIds,
      removedNodeIds: nodeDiff.removedNodeIds,
      counts,
      changes,
      oldContent,
      fileName,
      reviewRef: surfaceOptions.reviewRef,
      onCompareSideBySide: openSideBySide,
      onViewDiffCode: surfaceOptions.onViewDiffCode,
    },
    newContent,
    vscode.ViewColumn.Active,
  );

  if (!preview.panel) {
    vscode.window.showErrorMessage(
      `Review diagram failed to open for ${fileName}. Run npm run compile and restart the Extension Development Host.`,
    );
  }

  const closePanels = (): void => {
    try {
      preview.dispose();
    } catch {
      /* best-effort */
    }
    try {
      splitDispose?.();
    } catch {
      /* best-effort */
    }
    splitDispose = undefined;
  };

  return { closePanels, panel: preview.panel };
}

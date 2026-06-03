import * as path from "path";
import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { getWebviewHTML, PrReviewPreviewContext } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";
import {
    DiagramChangeItem,
    DiagramDiffCounts,
} from "../prReview/diagramNodeDiff";
import { disposePrReviewCodePanel, openPrReviewCodeBeside } from "../prReview/prReviewCodePanel";
import { calculateDiagramDiff, createHighlightInstructions, type HighlightInstruction } from "./diagramDiffHighlighter";

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

export interface PrReviewPreviewOptions extends DiagramDiffHighlightOptions {
  counts: DiagramDiffCounts;
  changes: DiagramChangeItem[];
  oldContent: string;
  fileName: string;
  prRef?: string;
  themeLabel?: string;
  onCompareSideBySide?: () => void;
}

/**
 * Open the diagram diff view: two separate webviews (Current and Updated), each with
 * full preview UI (zoom, pan, theme, export).
 *
 * Opt-in power-user path — the default PR-review flow uses
 * {@link openPrReviewPreview} with a Now/Before toggle instead.
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
    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
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
      highlightOptions?.addedNodeIds,
      highlightOptions
        ? {
            counts: {
              added: highlightOptions.addedNodeIds.length,
              modified: highlightOptions.modifiedNodeIds.length,
              removed: highlightOptions.removedNodeIds.length,
              total:
                highlightOptions.addedNodeIds.length +
                highlightOptions.modifiedNodeIds.length +
                highlightOptions.removedNodeIds.length,
            },
            changes: [],
            addedNodeIds: highlightOptions.addedNodeIds,
            modifiedNodeIds: highlightOptions.modifiedNodeIds,
          }
        : undefined,
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
 * Default PR-review surface: a single full-size diagram with Now/Before toggle,
 * summary chips, and a collapsed changes list. Removed nodes appear in the list
 * only — not drawn on the after diagram.
 */
export function openPrReviewPreview(
  options: PrReviewPreviewOptions,
  newContent: string,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
): { panel: vscode.WebviewPanel | undefined; dispose: () => void } {
  let panel: vscode.WebviewPanel | undefined;
  let currentPhase: "now" | "before" = "now";

  const dispose = (): void => {
    disposePrReviewCodePanel();
    panel?.dispose();
    panel = undefined;
  };

  try {
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);
    const { diagramText: oldDiagramText } = splitFrontMatter(options.oldContent);

    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    if (!extensionPath) {
      console.error("[Mermaid PR Review] Unable to resolve extension path");
      return { panel, dispose };
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;
    const themeLabel = formatThemeLabel(theme);

    const titleParts = ["After"];
    const countParts: string[] = [];
    if (options.counts.added > 0) { countParts.push(`${options.counts.added} added`); }
    if (options.counts.modified > 0) { countParts.push(`${options.counts.modified} changed`); }
    if (options.counts.removed > 0) { countParts.push(`${options.counts.removed} removed`); }
    const title = countParts.length
      ? `${titleParts[0]} · ${countParts.join(", ")}`
      : `${titleParts[0]} · ${options.fileName}`;

    const prReviewCtx: PrReviewPreviewContext = {
      counts: options.counts,
      changes: options.changes,
      addedNodeIds: options.addedNodeIds,
      modifiedNodeIds: options.modifiedNodeIds,
      removedNodeIds: options.removedNodeIds,
      prRef: options.prRef,
      themeLabel,
      currentTheme: theme,
      fileName: options.fileName,
      beforeDiagramText: oldDiagramText,
    };

    panel = vscode.window.createWebviewPanel(
      "mermaidPrReviewPreview",
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
      options.addedNodeIds,
      prReviewCtx,
    );

    wireHighlightRepost(panel, options);
    wirePrReviewMessages(
      panel,
      options,
      newDiagramText,
      oldDiagramText,
      theme,
      options.fileName,
      () => currentPhase,
      (p) => { currentPhase = p; },
      options.onCompareSideBySide,
    );

    const limits = readPreviewLimits();
    const sendInitialDiagram = (): void => {
      panel?.webview.postMessage({
        type: "update",
        content: newDiagramText,
        currentTheme: theme,
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
    console.error("[Mermaid PR Review] Failed to open preview:", err);
    vscode.window.showErrorMessage(`Mermaid preview failed: ${msg}`);
  }

  return { panel, dispose };
}

/**
 * @deprecated Use {@link openPrReviewPreview} for PR review. Kept for callers
 * that only need a single highlighted preview without review chrome.
 */
export function openSingleDiagramPreview(
  newContent: string,
  title: string,
  highlightOptions?: DiagramDiffHighlightOptions,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside,
): { panel: vscode.WebviewPanel | undefined; dispose: () => void } {
  let panel: vscode.WebviewPanel | undefined;
  const dispose = (): void => {
    panel?.dispose();
    panel = undefined;
  };

  try {
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);
    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    if (!extensionPath) {
      console.error("[Mermaid PR Review] Unable to resolve extension path");
      return { panel, dispose };
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;

    panel = vscode.window.createWebviewPanel(
      "mermaidPrReviewPreview",
      title,
      viewColumn,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = getWebviewHTML(
      panel,
      extensionPath,
      newDiagramText,
      theme,
      false,
      undefined,
      highlightOptions?.addedNodeIds,
    );

    wireHighlightRepost(panel, highlightOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid PR Review] Failed to open preview:", err);
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

function wirePrReviewMessages(
  panel: vscode.WebviewPanel,
  highlightOptions: DiagramDiffHighlightOptions,
  newDiagramText: string,
  oldDiagramText: string,
  initialTheme: string,
  fileName: string,
  getPhase: () => "now" | "before",
  setPhase: (p: "now" | "before") => void,
  onCompareSideBySide?: () => void,
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
        currentTheme,
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
      openPrReviewCodeBeside(panel, oldDiagramText, newDiagramText, fileName);
      return;
    }

    if (message.type === "viewChangeCode" && message.nodeId) {
      const kind =
        message.kind === "added" || message.kind === "modified" || message.kind === "removed"
          ? message.kind
          : "modified";
      openPrReviewCodeBeside(panel, oldDiagramText, newDiagramText, fileName, {
        nodeId: message.nodeId,
        kind,
        changeLabel: message.changeLabel,
      });
      return;
    }

    if (message.type === "focusChange" && message.nodeId) {
      panel.webview.postMessage({ type: "focusNode", nodeId: message.nodeId });
      panel.webview.postMessage({ type: "centerOnNode", nodeId: message.nodeId, autofocus: true });
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

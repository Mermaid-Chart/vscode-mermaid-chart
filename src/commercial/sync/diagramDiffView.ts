import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { getWebviewHTML } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";

export interface DiagramDiffHighlightOptions {
  /** Node identifiers present only in `newContent` — outlined on the Updated panel. */
  addedNodeIds: string[];
  /** Node identifiers present only in `oldContent` — reserved for Slice 4. */
  removedNodeIds: string[];
}

/**
 * Open the diagram diff view: two separate webviews (Current and Updated), each with
 * full preview UI (zoom, pan, theme, export).
 *
 * When `highlightOptions` is supplied, the Updated panel paints a steady
 * outline (no pulse, no loop) around nodes that exist only in the new
 * source — used by the Slice 2 PR-review flow to draw the eye to what the
 * bot added.
 *
 * Returns a dispose function — call it to close both preview panels programmatically
 * (e.g. when the associated diff editor or conflict document is closed).
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

  try {
    const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);

    const extensionPath = vscode.extensions.getExtension(`${packageJson.publisher}.${packageJson.name}`)?.extensionPath;
    if (!extensionPath) {
      console.error("[Mermaid Diagram Diff] Unable to resolve extension path");
      vscode.window.showErrorMessage("Unable to resolve extension path for diagram diff.");
      return disposePanels;
    }

    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const config = vscode.workspace.getConfiguration();
    const darkTheme = config.get<string>("mermaid.vscode.dark", "redux-dark");
    const lightTheme = config.get<string>("mermaid.vscode.light", "redux");
    const theme = isDarkTheme ? darkTheme : lightTheme;

    // Panel 1: Current (old) diagram – top, full preview UI (zoom, pan, theme)
    panelCurrent = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffCurrent",
      "Current Changes",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panelCurrent.webview.html = getWebviewHTML(
      panelCurrent,
      extensionPath,
      oldDiagramText,
      theme,
      false
    );

    // Panel 2: Updated (new) diagram – bottom, full preview UI
    panelUpdated = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffUpdated",
      "Incoming Changes",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panelUpdated.webview.html = getWebviewHTML(
      panelUpdated,
      extensionPath,
      newDiagramText,
      theme,
      false,
      undefined,
      highlightOptions?.addedNodeIds,
    );

    if (highlightOptions?.addedNodeIds.length) {
      // Re-emit on every visibility flip so the highlight survives a tab switch
      // (the inline highlight script re-applies on each `highlightNodes` message).
      const repost = () => {
        if (panelUpdated?.visible) {
          panelUpdated.webview.postMessage({
            type: "highlightNodes",
            addedNodeIds: highlightOptions.addedNodeIds,
          });
        }
      };
      panelUpdated.onDidChangeViewState(repost);
      setTimeout(repost, 200);
    }

    // Set editor layout: code diff on left, two diagram panels stacked vertically on right
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Diagram Diff] Error opening diagram diff view:", err);
    vscode.window.showErrorMessage(`Diagram diff view failed: ${msg}`);
  }

  return disposePanels;
}

/**
 * Open a single Mermaid preview pane in the column beside the active editor.
 *
 * Slice 2 PR-review variant of {@link openDiagramDiffWebviews}: we only need
 * the *new* (post-bot) diagram, with newly-added nodes outlined in the
 * theme's git-added color so the eye lands on the change immediately.
 *
 * Returns a dispose function.
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

    if (highlightOptions?.addedNodeIds.length) {
      const repost = () => {
        if (panel?.visible) {
          panel.webview.postMessage({
            type: "highlightNodes",
            addedNodeIds: highlightOptions.addedNodeIds,
          });
        }
      };
      panel.onDidChangeViewState(repost);
      setTimeout(repost, 200);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid PR Review] Failed to open preview:", err);
    vscode.window.showErrorMessage(`Mermaid preview failed: ${msg}`);
  }

  return { panel, dispose };
}

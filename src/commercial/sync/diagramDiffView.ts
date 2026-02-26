import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { getWebviewHTML } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";

/**
 * Open the diagram diff view: two separate webviews (Current and Updated), each with
 * full preview UI (zoom, pan, theme, export).
 *
 * Returns a dispose function — call it to close both preview panels programmatically
 * (e.g. when the associated diff editor or conflict document is closed).
 */
export function openDiagramDiffWebviews(oldContent: string, newContent: string): () => void {
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
      false
    );

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

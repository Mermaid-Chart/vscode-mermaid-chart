import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { getWebviewHTML } from "../../templates/previewTemplate";
import * as packageJson from "../../../package.json";

/**
 * Open the diagram diff view: two separate webviews (Current and Updated), each with
 * full preview UI (zoom, pan, theme, export).
 */
export function openDiagramDiffWebviews(oldContent: string, newContent: string): void {
  try {
    const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
    const { diagramText: newDiagramText } = splitFrontMatter(newContent);

    // Get extension path directly - we know we exist since we're running!
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

    // Panel 1: Current (old) diagram – top, full preview UI (zoom, pan, theme)
    const panelCurrent = vscode.window.createWebviewPanel(
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
    const panelUpdated = vscode.window.createWebviewPanel(
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
    // (Current on top, Updated on bottom)
    setTimeout(() => {
      void vscode.commands.executeCommand("vscode.setEditorLayout", {
        orientation: 0, // horizontal: left | right
        groups: [
          { size: 0.5 }, // Group 0: code diff (left)
          {
            groups: [
              { size: 0.5 }, // Group 1: Current diagram (top)
              { size: 0.5 }  // Group 2: Updated diagram (bottom)
            ],
            size: 0.5,
            orientation: 1 // vertical
          }
        ]
      });
    }, 150);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Diagram Diff] Error opening diagram diff view:", err);
    vscode.window.showErrorMessage(`Diagram diff view failed: ${msg}`);
  }
}

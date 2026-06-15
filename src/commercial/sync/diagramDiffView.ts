import * as vscode from "vscode";
import { splitFrontMatter } from "../../frontmatter";
import { setupDiagramDiffPreview } from "../../diagramDiffPreview";
import { debounce } from "../../utils/debounce";
import { calculateDiagramDiff, createHighlightInstructions, type HighlightInstruction } from "./diagramDiffHighlighter";

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
  disposables: vscode.Disposable[]
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
    })
  );
}

function applyDiffHighlights(
  panelCurrent: vscode.WebviewPanel | undefined,
  panelUpdated: vscode.WebviewPanel | undefined,
  newDiagramInstructions: HighlightInstruction[],
  oldDiagramInstructions: HighlightInstruction[]
): void {
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
}

export function openDiagramDiffWebviews(
  oldContent: string,
  newContent: string,
  options?: DiagramDiffWebviewOptions
): () => void {
  let panelCurrent: vscode.WebviewPanel | undefined;
  let panelUpdated: vscode.WebviewPanel | undefined;
  const disposables: vscode.Disposable[] = [];

  const disposePanels = (): void => {
    panelCurrent?.dispose();
    panelUpdated?.dispose();
    panelCurrent = undefined;
    panelUpdated = undefined;
    while (disposables.length) {
      disposables.pop()?.dispose();
    }
  };

  const openPanels = (oldDiagramText: string, newDiagramText: string): void => {
    panelCurrent = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffCurrent",
      "Current Changes",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panelUpdated = vscode.window.createWebviewPanel(
      "mermaidDiagramDiffUpdated",
      "Incoming Changes",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    setupDiagramDiffPreview(
      panelCurrent,
      oldDiagramText,
      options?.currentRepairDocumentUri,
      disposables
    );
    setupDiagramDiffPreview(
      panelUpdated,
      newDiagramText,
      options?.incomingRepairDocumentUri,
      disposables
    );

    wirePreviewDocumentSync(panelCurrent, options?.currentRepairDocumentUri, disposables);
    wirePreviewDocumentSync(panelUpdated, options?.incomingRepairDocumentUri, disposables);

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
      .then(({ newDiagramInstructions, oldDiagramInstructions }) => {
        if (newDiagramInstructions.length === 0 && oldDiagramInstructions.length === 0) {
          return;
        }
        setTimeout(() => {
          applyDiffHighlights(
            panelCurrent,
            panelUpdated,
            newDiagramInstructions,
            oldDiagramInstructions
          );
        }, 400);
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Mermaid Diagram Diff] Error opening diagram diff view:", err);
    vscode.window.showErrorMessage(`Diagram diff view failed: ${msg}`);
  }

  return disposePanels;
}

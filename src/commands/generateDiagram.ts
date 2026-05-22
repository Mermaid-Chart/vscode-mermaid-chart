import * as vscode from "vscode";
import {
  dedentCommonIndent,
  detectBestDiagramTypeFromSource,
  looksLikeMermaidDiagram,
  pickDiagramType,
} from "../services/diagramDetector";
import { generateDiagramFromCode } from "../services/llmService";
import { normalizeMermaidText } from "../frontmatter";
import { createMermaidFile } from "./createFile";
import { showSuggestionsTab } from "../panels/suggestionsPanel";

export async function generateDiagramFromActiveFile(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("Open a code file first to generate a diagram.");
    return;
  }

  const document = editor.document;
  if (document.languageId.startsWith("mermaid") || document.fileName.endsWith(".mmd") || document.fileName.endsWith(".mermaid")) {
    vscode.window.showInformationMessage("This file is already a Mermaid diagram. Use Preview instead.");
    await vscode.commands.executeCommand("mermaidChart.preview");
    return;
  }

  const rawSource = editor.selection.isEmpty
    ? document.getText()
    : document.getText(editor.selection);

  if (!rawSource.trim()) {
    vscode.window.showWarningMessage(
      "No text to use. Select the code (or Mermaid snippet) to turn into a diagram, or clear the selection to use the whole file."
    );
    return;
  }

  const sourceForAi = dedentCommonIndent(rawSource);
  const fileLabel = document.fileName.split("/").pop() ?? "file";

  if (looksLikeMermaidDiagram(sourceForAi)) {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: "$(preview) Open selection as diagram",
          description: "Use the selected Mermaid text as-is (no AI)",
          value: "direct" as const,
        },
        {
          label: "$(sparkle) Refine or convert with AI",
          description: "Send selection to the language model",
          value: "ai" as const,
        },
      ],
      {
        title: "Selection looks like Mermaid syntax",
        placeHolder: "Choose how to open the diagram",
      }
    );
    if (!choice) {
      return;
    }
    if (choice.value === "direct") {
      await createMermaidFile(context, normalizeMermaidText(sourceForAi), false);
      vscode.window.showInformationMessage("Opened diagram from selection. Preview should appear automatically.");
      return;
    }
  }

  const suggestion = detectBestDiagramTypeFromSource(sourceForAi, document.languageId, document.fileName);

  const diagramType = await pickDiagramType(suggestion, context.extensionUri);
  if (!diagramType) {
    return;
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Generating ${diagramType} diagram...`,
      cancellable: false,
    },
    async () => {
      return generateDiagramFromCode(
        sourceForAi,
        document.languageId,
        diagramType,
        fileLabel
      );
    }
  );

  if (!result) {
    return;
  }

  await createMermaidFile(context, result.mermaidCode, false);

  const sourceLabel =
    result.source === "cursor" ? "Cursor AI" :
    result.source === "copilot" ? "GitHub Copilot" :
    result.source === "mermaid-api" ? "Mermaid Chart" :
    "AI";

  vscode.window.showInformationMessage(`Diagram generated using ${sourceLabel}. Edit the code and the preview will update.`);

  await showSuggestionsTab(context.extensionUri);
}

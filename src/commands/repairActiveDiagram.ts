import * as vscode from "vscode";
import mermaid, { type MermaidConfig } from "@mermaid-chart/mermaid";
import { RepairDiagram } from "../panels/repairDiagram";
import { canOpenMermaidPreview, ensureAuthenticated, getActiveOrOpenMermaidDocument } from "../util";

/** CodeLens repair the active .mmd using Mermaid AI (requires sign-in). */
export async function repairActiveDiagram(): Promise<void> {
  const doc = getActiveOrOpenMermaidDocument();
  if (!doc) {
    vscode.window.showErrorMessage("Open a diagram file to repair.");
    return;
  }
  if (!canOpenMermaidPreview(doc)) {
    vscode.window.showErrorMessage("Repair works on .mmd / .mermaid files only.");
    return;
  }

  const code = doc.getText();
  if (!code.trim()) {
    vscode.window.showWarningMessage("The diagram file is empty.");
    return;
  }

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "parseOnly",
      flowchart: { parser: "jison" },
      sequence: { parser: "antlr" },
      maxTextSize: 90000,
    } as MermaidConfig);
    await mermaid.parse(code);
    vscode.window.showInformationMessage(
      "This diagram has no syntax errors. Nothing to repair."
    );
    return;
  } catch (err) {
    if (!(await ensureAuthenticated())) {
      return;
    }
    const errorText = err instanceof Error ? err.message : String(err);
    await RepairDiagram.repairDiagram(code, errorText, doc);
  }
}

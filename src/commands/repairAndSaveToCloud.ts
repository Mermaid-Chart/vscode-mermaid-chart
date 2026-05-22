import * as vscode from "vscode";
import { sendLanguageModelUserPrompt } from "../services/vscodeLanguageModel";

/**
 * Repairs the current .mmd diagram using the available LLM,
 * then prompts the user to log in / create a Mermaid Chart account
 * so the repaired diagram can be saved to the cloud.
 *
 * The UI for this flow is intentionally kept editable —
 * the user expressed intent to redesign it later.
 */
export async function repairAndSaveToCloud(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("Open a .mmd diagram to repair.");
    return;
  }

  const doc = editor.document;
  const isMermaid =
    doc.fileName.endsWith(".mmd") ||
    doc.fileName.endsWith(".mermaid") ||
    doc.languageId.startsWith("mermaid");

  if (!isMermaid) {
    vscode.window.showErrorMessage("This command works on .mmd / .mermaid files only.");
    return;
  }

  const originalCode = doc.getText();
  if (!originalCode.trim()) {
    vscode.window.showErrorMessage("The diagram file is empty.");
    return;
  }

  const repaired = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Repairing diagram...",
      cancellable: false,
    },
    async () => {
      return repairWithLlm(originalCode, doc.languageId);
    }
  );

  if (!repaired) {
    return;
  }

  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, fullRange, repaired);
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage("Diagram repaired. Prompting login to save to cloud...");

  let isLoggedIn = false;
  try {
    const session = await vscode.authentication.getSession("mermaidchart", [], { silent: true });
    isLoggedIn = !!session;
  } catch {
    // not logged in
  }

  if (isLoggedIn) {
    await vscode.commands.executeCommand("mermaidChart.connectDiagramToMermaidChart");
  } else {
    const action = await vscode.window.showInformationMessage(
      "Sign in to Mermaid Chart to save your repaired diagram to the cloud.",
      "Sign in",
      "Create account",
      "Later"
    );
    if (action === "Sign in" || action === "Create account") {
      await vscode.commands.executeCommand("mermaidChart.login");
    }
  }
}

async function repairWithLlm(code: string, languageId: string): Promise<string | undefined> {
  const prompt = `You are a Mermaid diagram syntax expert. The following Mermaid diagram code may have syntax errors or could be improved.

Rules:
- Fix any syntax errors while preserving the original intent
- Output ONLY the corrected Mermaid diagram code (no explanation, no markdown fences)
- Keep the same diagram type
- Preserve all node labels, relationships, and styling
- If the code is already valid, return it unchanged

Diagram code:
\`\`\`mermaid
${code}
\`\`\`

Return the corrected Mermaid diagram code:`;

  try {
    const result = await sendLanguageModelUserPrompt(
      prompt,
      "Repair Mermaid diagram syntax in the Mermaid Chart extension."
    );
    if (!result) {
      vscode.window.showWarningMessage("No AI model available. Install GitHub Copilot Chat or sign in to Mermaid Chart for AI repair.");
      const action = await vscode.window.showInformationMessage(
        "Sign in to use Mermaid Chart’s cloud AI repair.",
        "Sign in",
        "Cancel"
      );
      if (action === "Sign in") {
        await vscode.commands.executeCommand("mermaidChart.login");
      }
      return undefined;
    }

    const fencedMatch = result.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
    return fencedMatch ? fencedMatch[1].trim() : result.trim();
  } catch (err: any) {
    console.error("LLM repair failed:", err?.message);
    vscode.window.showWarningMessage("AI repair failed. Sign in to Mermaid Chart for API-based repair.");
    return undefined;
  }
}

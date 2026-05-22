import * as vscode from "vscode";
import { sendLanguageModelUserPrompt, isLanguageModelAvailable } from "./vscodeLanguageModel";

export type LlmSource = "cursor" | "copilot" | "mermaid-api" | "none";

export interface LlmResult {
  mermaidCode: string;
  source: LlmSource;
}

/**
 * Generates a Mermaid diagram from source code.
 *
 * LLM resolution order:
 *   1. VS Code Language Model API — picks up Cursor AI or GitHub Copilot automatically.
 *   2. If no model is available, prompts the user to install Copilot or sign in.
 *
 * The Mermaid Chart cloud API (repairDiagram) is used separately for diagram
 * repair, not for code-to-diagram generation.
 */
export async function generateDiagramFromCode(
  codeContent: string,
  languageId: string,
  diagramType: string,
  fileName: string
): Promise<LlmResult | undefined> {
  const prompt = buildPrompt(codeContent, languageId, diagramType, fileName);

  const vscodeLmResult = await tryVsCodeLanguageModel(prompt);
  if (vscodeLmResult) {
    return { mermaidCode: vscodeLmResult, source: inferLlmSource() };
  }

  const isCursor = isRunningInCursor();
  const message = isCursor
    ? "No AI model responded. Make sure Cursor's AI features are enabled, then try again."
    : "No AI model available. Install GitHub Copilot Chat for AI-powered diagram generation, or sign in to Mermaid Chart for cloud AI features.";
  const actions = isCursor ? ["Try again"] : ["Install Copilot", "Sign in to Mermaid Chart"];

  const choice = await vscode.window.showInformationMessage(message, ...actions);
  if (choice === "Install Copilot") {
    await vscode.commands.executeCommand("extension.open", "GitHub.copilot-chat");
  } else if (choice === "Sign in to Mermaid Chart") {
    await vscode.commands.executeCommand("mermaidChart.login");
  } else if (choice === "Try again") {
    return generateDiagramFromCode(codeContent, languageId, diagramType, fileName);
  }
  return undefined;
}

async function tryVsCodeLanguageModel(prompt: string): Promise<string | undefined> {
  const raw = await sendLanguageModelUserPrompt(
    prompt,
    "Generate a Mermaid diagram from your source code (Mermaid Chart extension)."
  );
  return raw ? extractMermaidFromResponse(raw) : undefined;
}

function inferLlmSource(): LlmSource {
  if (isRunningInCursor()) {
    return "cursor";
  }
  return "copilot";
}

function extractMermaidFromResponse(response: string): string {
  const fencedMatch = response.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return response.trim();
}

function isRunningInCursor(): boolean {
  const appName = vscode.env.appName ?? "";
  return appName.toLowerCase().includes("cursor");
}

function buildPrompt(code: string, languageId: string, diagramType: string, fileName: string): string {
  const maxCodeLength = 8000;
  const truncatedCode = code.length > maxCodeLength
    ? code.substring(0, maxCodeLength) + "\n// ... (truncated)"
    : code;

  return `You are a Mermaid diagram expert. Analyze the following ${languageId} code from file "${fileName}" and generate a ${diagramType} diagram in Mermaid syntax.

Rules:
- Output ONLY valid Mermaid diagram code (no explanation, no markdown fences)
- The diagram type MUST be: ${diagramType}
- Extract meaningful structure from the code: classes, functions, relationships, data flow
- Use descriptive labels for nodes (not just variable names)
- Keep the diagram readable — collapse minor details
- If the code has too many elements, show the most important ones

Code:
\`\`\`${languageId}
${truncatedCode}
\`\`\`

Generate the ${diagramType} Mermaid diagram:`;
}

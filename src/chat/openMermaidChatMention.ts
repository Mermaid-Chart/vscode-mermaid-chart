import * as vscode from "vscode";

export type OpenMermaidChatResult = "copilot" | "generic" | "manual";

/**
 * Inserts `@mermaid-chart` (plus optional slash-command suffix) into the chat input.
 * This targets the VS Code GitHub Copilot Chat participant registered by this extension.
 * Cursor’s own chat does not load VS Code chat participants; users get instructions instead.
 */
export async function openChatWithMermaidMention(options: {
  suffix?: string;
  submit?: boolean;
}): Promise<OpenMermaidChatResult> {
  const suffix = options.suffix ?? "";
  const submit = options.submit ?? false;
  const text = `@mermaid-chart${suffix}`;

  const copilot = vscode.extensions.getExtension("GitHub.copilot-chat");
  if (copilot) {
    try {
      await vscode.commands.executeCommand("workbench.panel.chat.view.copilot.focus");
      await vscode.commands.executeCommand("workbench.action.chat.focusInput");
      await vscode.commands.executeCommand("deleteAllLeft");
      await vscode.commands.executeCommand("default:type", { text });
      if (submit) {
        await vscode.commands.executeCommand("workbench.action.chat.submit");
      }
      return "copilot";
    } catch {
      /* try fallbacks */
    }
  }

  const genericChatCommands = [
    "workbench.action.chat.open",
    "workbench.action.chat.toggle",
    "aichat.newchataction",
  ];
  for (const cmd of genericChatCommands) {
    try {
      await vscode.commands.executeCommand(cmd);
      await vscode.commands.executeCommand("workbench.action.chat.focusInput");
      await vscode.commands.executeCommand("deleteAllLeft");
      await vscode.commands.executeCommand("default:type", { text });
      if (submit) {
        await vscode.commands.executeCommand("workbench.action.chat.submit");
      }
      return "generic";
    } catch {
      continue;
    }
  }

  const app = vscode.env.appName ?? "";
  const isCursor = app.toLowerCase().includes("cursor");

  if (isCursor) {
    await vscode.window.showInformationMessage(
      `This extension registers @mermaid-chart for GitHub Copilot Chat in VS Code. In Cursor, open Chat (⌘L) and ask for a Mermaid diagram in plain language, or use VS Code + Copilot Chat for @mermaid-chart. Text to paste if your chat supports it: ${text}`
    );
    return "manual";
  }

  const installOption = "Install GitHub Copilot Chat";
  const pick = await vscode.window.showErrorMessage(
    "GitHub Copilot Chat is not installed or could not be opened. @mermaid-chart works in Copilot Chat.",
    installOption
  );
  if (pick === installOption) {
    await vscode.commands.executeCommand("extension.open", "GitHub.copilot-chat");
  }
  return "manual";
}

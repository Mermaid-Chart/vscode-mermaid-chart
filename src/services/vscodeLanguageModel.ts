import * as vscode from "vscode";

let extensionContext: vscode.ExtensionContext | undefined;

export function registerLanguageModelExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

const MODEL_SELECTORS: vscode.LanguageModelChatSelector[] = [
  { vendor: "copilot" },
  { vendor: "github" },
  {},
];

/**
 * Checks whether any language model is available (Copilot, Cursor AI, etc.).
 * Does not trigger consent prompts.
 */
export async function isLanguageModelAvailable(): Promise<boolean> {
  const model = await selectLanguageModelChat();
  return model !== undefined;
}

/**
 * Returns a human-readable name for the currently available LLM provider,
 * or `undefined` if none is available.
 */
export async function getLanguageModelProviderName(): Promise<string | undefined> {
  const model = await selectLanguageModelChat();
  if (!model) {
    return undefined;
  }
  const appName = vscode.env.appName?.toLowerCase() ?? "";
  if (appName.includes("cursor")) {
    return "Cursor AI";
  }
  return model.name || model.vendor || "Language Model";
}

export async function selectLanguageModelChat(): Promise<vscode.LanguageModelChat | undefined> {
  if (!vscode.lm?.selectChatModels) {
    return undefined;
  }

  const seen = new Set<string>();
  const access = extensionContext?.languageModelAccessInformation;

  for (const selector of MODEL_SELECTORS) {
    let models: vscode.LanguageModelChat[];
    try {
      models = await vscode.lm.selectChatModels(selector);
    } catch {
      continue;
    }
    if (!models?.length) {
      continue;
    }

    for (const model of models) {
      if (seen.has(model.id)) {
        continue;
      }
      seen.add(model.id);

      if (access) {
        const allowed = access.canSendRequest(model);
        if (allowed === false) {
          continue;
        }
      }

      return model;
    }
  }

  return undefined;
}

export async function sendLanguageModelUserPrompt(
  userPrompt: string,
  justification: string
): Promise<string | undefined> {
  return sendLanguageModelMessages([vscode.LanguageModelChatMessage.User(userPrompt)], justification);
}

export async function sendLanguageModelMessages(
  messages: vscode.LanguageModelChatMessage[],
  justification: string
): Promise<string | undefined> {
  const model = await selectLanguageModelChat();
  if (!model) {
    return undefined;
  }

  const token = new vscode.CancellationTokenSource().token;

  try {
    const response = await model.sendRequest(messages, { justification }, token);
    let result = "";
    for await (const chunk of response.text) {
      result += chunk;
    }
    return result;
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "NoPermissions") {
      const appName = vscode.env.appName?.toLowerCase() ?? "";
      const isCursor = appName.includes("cursor");
      const hint = isCursor
        ? "Accept the prompt when the extension requests language model access."
        : "Ensure GitHub Copilot Chat is installed and accept the prompt when the extension requests language model access.";
      void vscode.window.showWarningMessage(`AI features need access to a chat model. ${hint}`);
    }
    console.log("Language model request failed:", e?.message ?? err);
    return undefined;
  }
}

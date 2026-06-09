import * as vscode from "vscode";

let extensionContext: vscode.ExtensionContext | undefined;

export function registerLanguageModelExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export interface LanguageModelInfo {
  id: string;
  name: string;
  vendor: string;
}

export interface LanguageModelRequestOptions {
  modelId?: string;
  cancellationToken?: vscode.CancellationToken;
}

const MODEL_SELECTORS: vscode.LanguageModelChatSelector[] = [
  { vendor: "copilot" },
  { vendor: "github" },
  {},
];

function isModelAllowed(model: vscode.LanguageModelChat): boolean {
  const access = extensionContext?.languageModelAccessInformation;
  if (!access) {
    return true;
  }
  return access.canSendRequest(model) !== false;
}

async function fetchAllChatModels(): Promise<vscode.LanguageModelChat[]> {
  if (!vscode.lm?.selectChatModels) {
    return [];
  }

  const seen = new Set<string>();
  const models: vscode.LanguageModelChat[] = [];

  for (const selector of MODEL_SELECTORS) {
    let batch: vscode.LanguageModelChat[];
    try {
      batch = await vscode.lm.selectChatModels(selector);
    } catch {
      continue;
    }
    if (!batch?.length) {
      continue;
    }

    for (const model of batch) {
      if (seen.has(model.id) || !isModelAllowed(model)) {
        continue;
      }
      seen.add(model.id);
      models.push(model);
    }
  }

  return models;
}

/**
 * All language models the user can send requests to (Copilot, Cursor, etc.).
 */
export async function listAvailableChatModels(): Promise<LanguageModelInfo[]> {
  const models = await fetchAllChatModels();
  return models.map((m) => ({
    id: m.id,
    name: m.name || m.vendor || "Language Model",
    vendor: m.vendor,
  }));
}

export async function resolveLanguageModelChat(
  modelId?: string
): Promise<vscode.LanguageModelChat | undefined> {
  const models = await fetchAllChatModels();
  if (!models.length) {
    return undefined;
  }
  if (modelId) {
    return models.find((m) => m.id === modelId) ?? models[0];
  }
  return models[0];
}

/** @deprecated Use listAvailableChatModels or resolveLanguageModelChat */
export async function selectLanguageModelChat(): Promise<vscode.LanguageModelChat | undefined> {
  return resolveLanguageModelChat();
}

/**
 * Checks whether any language model is available (Copilot, Cursor AI, etc.).
 * Does not trigger consent prompts.
 */
export async function isLanguageModelAvailable(): Promise<boolean> {
  const models = await listAvailableChatModels();
  return models.length > 0;
}

/**
 * Returns a human-readable name for the given or first available model.
 */
export async function getLanguageModelDisplayName(modelId?: string): Promise<string | undefined> {
  const model = await resolveLanguageModelChat(modelId);
  if (!model) {
    return undefined;
  }
  const appName = vscode.env.appName?.toLowerCase() ?? "";
  if (appName.includes("cursor") && !model.vendor) {
    return model.name || "Cursor AI";
  }
  return model.name || model.vendor || "Language Model";
}

/** @deprecated Use getLanguageModelDisplayName */
export async function getLanguageModelProviderName(): Promise<string | undefined> {
  return getLanguageModelDisplayName();
}

export function isLanguageModelCancellation(err: unknown): boolean {
  if (err instanceof vscode.CancellationError) {
    return true;
  }
  const e = err as { name?: string; code?: string; message?: string };
  return (
    e?.name === "Canceled" ||
    e?.name === "Cancelled" ||
    e?.code === "Canceled" ||
    e?.code === "Cancelled" ||
    (typeof e?.message === "string" && /cancel/i.test(e.message))
  );
}

export function throwIfLanguageModelCancelled(
  token?: vscode.CancellationToken
): void {
  if (token?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }
}

export async function sendLanguageModelUserPrompt(
  userPrompt: string,
  justification: string,
  options?: LanguageModelRequestOptions
): Promise<string | undefined> {
  return sendLanguageModelMessages(
    [vscode.LanguageModelChatMessage.User(userPrompt)],
    justification,
    options
  );
}

export async function sendLanguageModelMessages(
  messages: vscode.LanguageModelChatMessage[],
  justification: string,
  options?: LanguageModelRequestOptions
): Promise<string | undefined> {
  throwIfLanguageModelCancelled(options?.cancellationToken);

  const model = await resolveLanguageModelChat(options?.modelId);
  if (!model) {
    return undefined;
  }

  try {
    const response = await model.sendRequest(
      messages,
      { justification },
      options?.cancellationToken
    );
    throwIfLanguageModelCancelled(options?.cancellationToken);

    let result = "";
    for await (const chunk of response.text) {
      throwIfLanguageModelCancelled(options?.cancellationToken);
      result += chunk;
    }
    return result;
  } catch (err: unknown) {
    if (isLanguageModelCancellation(err)) {
      throw err;
    }
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

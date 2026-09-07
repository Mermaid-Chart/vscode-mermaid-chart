import { aiHandler } from "@mermaid-chart/vscode-utils";
import * as vscode from "vscode";
import { isSignedIn, promptForLogin } from "../../loginTrigger";

export function initializeAIChatParticipant(
  context: vscode.ExtensionContext,
): vscode.ChatParticipant {
  const authenticatedAIHandler: vscode.ChatRequestHandler = async (
    request,
    chatContext,
    stream,
    token,
  ) => {
    if (!(await isSignedIn())) {
      stream.markdown(
        "**You need a Mermaid account to use this feature.**\n\n" +
          "Sign in from the Mermaid icon in the activity bar, then run this command again. " +
          "If you want to keep working without an account, use the " +
          "[Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=vstirbu.vscode-mermaid-preview) extension.",
      );
      // Not awaited: the notification only resolves once the user clicks it,
      // which would leave the chat response spinning.
      void promptForLogin(
        "hard-login-gate",
        "Sign in to Mermaid to use AI diagramming. Use Mermaid Preview if you want to continue without an account.",
      );
      return;
    }

    return aiHandler(request, chatContext, stream, token);
  };

  const tutor = vscode.chat.createChatParticipant(
    "mermaid-chart",
    authenticatedAIHandler,
  );
  tutor.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    "images",
    "mermaid-icon.svg",
  );
  return tutor;
}
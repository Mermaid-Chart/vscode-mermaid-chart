import * as vscode from 'vscode';
import analytics, { type LoginTrigger } from './analytics';

let pendingLoginTrigger: LoginTrigger | undefined;

export function setPendingLoginTrigger(trigger: LoginTrigger): void {
  pendingLoginTrigger = trigger;
}

export function getPendingLoginTrigger(): LoginTrigger {
  return pendingLoginTrigger ?? 'mermaid-sidebar';
}

export function consumePendingLoginTrigger(): LoginTrigger {
  const trigger = pendingLoginTrigger ?? 'mermaid-sidebar';
  pendingLoginTrigger = undefined;
  return trigger;
}

export async function promptForLogin(
  trigger: LoginTrigger,
  message: string,
  loginLabel = 'Login',
): Promise<boolean> {
  const session = await vscode.authentication.getSession(
    'mermaidchart',
    [],
    { silent: true },
  );
  if (session) {
    return true;
  }

  analytics.trackSignInPromptShown(trigger);
  const selection = await vscode.window.showInformationMessage(message, loginLabel);
  if (selection !== loginLabel) {
    return false;
  }

  analytics.trackSignInPromptClicked(trigger);
  setPendingLoginTrigger(trigger);
  await vscode.commands.executeCommand('mermaidChart.login', trigger);

  const afterLogin = await vscode.authentication.getSession(
    'mermaidchart',
    [],
    { silent: true },
  );
  return !!afterLogin;
}

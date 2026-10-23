import * as vscode from 'vscode';
import analytics, { type LoginTrigger } from './analytics';

/** Marketplace id for the open Mermaid Preview extension (PLUG-145 handoff). */
export const MERMAID_PREVIEW_EXTENSION_ID = 'vstirbu.vscode-mermaid-preview';

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

export async function isSignedIn(): Promise<boolean> {
  const session = await vscode.authentication.getSession(
    'mermaidchart',
    [],
    { silent: true },
  );
  return !!session;
}

export async function promptForLogin(
  trigger: LoginTrigger,
  message: string,
): Promise<boolean> {
  if (await isSignedIn()) {
    return true;
  }

  analytics.trackHardLoginPromptShown(trigger);
  const selection = await vscode.window.showInformationMessage(
    message,
    'Show more',
    'Get the extension',
    'Discard',
  );

  if (selection === 'Show more') {
    analytics.trackShowMoreClick();
    await vscode.commands.executeCommand('mermaidChart.showLoginRequiredChanges');
  } else if (selection === 'Get the extension') {
    await vscode.commands.executeCommand(
      'mermaidChart.getPreviewExtension',
      'hardLoginPopup',
    );
  }

  return false;
}

export function registerAuthenticatedCommand(
  command: string,
  callback: (...args: any[]) => any,
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: any[]) => {
    if (!(await promptForLogin(
      'hard-login-gate',
      'Sign in to Mermaid to use this functionality. Use Mermaid Preview if you want to continue without an account.',
    ))) {
      return;
    }
    return callback(...args);
  });
}

/**
 * Preview entry points: signed-in users stay on Chart; signed-out users with
 * Mermaid Preview installed are handed off so Preview works without login (PLUG-145).
 */
export function registerPreviewCommand(
  command: string,
  previewFallbackCommand: string,
  callback: (...args: any[]) => any,
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: any[]) => {
    if (await isSignedIn()) {
      return callback(...args);
    }

    const previewExt = vscode.extensions.getExtension(MERMAID_PREVIEW_EXTENSION_ID);
    if (previewExt) {
      try {
        if (!previewExt.isActive) {
          await previewExt.activate();
        }
        return await vscode.commands.executeCommand(previewFallbackCommand);
      } catch (error) {
        console.log(
          { error, previewFallbackCommand },
          'PLUG-145: Preview handoff failed; falling back to login prompt',
        );
      }
    }

    await promptForLogin(
      'hard-login-gate',
      'Sign in to Mermaid to use this functionality. Use Mermaid Preview if you want to continue without an account.',
    );
  });
}

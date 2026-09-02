import * as vscode from "vscode";
import analytics from "../../analytics";
import { DiagramRegenerator } from '@mermaid-chart/vscode-utils';
import { registerAuthenticatedCommand } from "../../loginTrigger";


export function registerRegenerateCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    registerAuthenticatedCommand('mermaidChart.regenerateDiagram',
      async (uri: vscode.Uri, originalQuery?: string, changedFiles?: string[], metadata?: any) => {
        // Track regenerate command invocation
        analytics.trackRegenerateCommandInvoked();

        await DiagramRegenerator.regenerateDiagram(uri, originalQuery, changedFiles, metadata);
      }
    )
  );
} 
import * as vscode from 'vscode';
import * as path from 'path';
import { addMetadataToFrontmatter, splitFrontMatter, extractMetadataFromCode } from '../../frontmatter';
import { MermaidChartAuthenticationProvider } from '../../mermaidChartAuthenticationProvider';
import type { MermaidChartVSCode } from '../../mermaidChartVSCode';


export function registerRegenerateWithMermaidAICommand(
  context: vscode.ExtensionContext,
  mcAPI: MermaidChartVSCode,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mermaidChart.regenerateDiagramWithMermaidAI',
      async (mmdUri: vscode.Uri, sourceFiles: string[]) => {
        const session = await vscode.authentication.getSession(
          MermaidChartAuthenticationProvider.id,
          [],
          { silent: true },
        );

        if (!session) {
          const pick = await vscode.window.showInformationMessage(
            'Please login to Mermaid Chart to regenerate diagrams with Mermaid AI.',
            { modal: true },
            'Login',
          );
          if (pick === 'Login') {
            await mcAPI.login();
          }
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Regenerating ${path.basename(mmdUri.fsPath)} with Mermaid AI...`,
            cancellable: false,
          },
          async () => {
            try {
              // Read current diagram content
              const bytes = await vscode.workspace.fs.readFile(mmdUri);
              const fullContent = Buffer.from(bytes).toString('utf-8');
              const { diagramText } = splitFrontMatter(fullContent);

              const result = await mcAPI.regenerateDiagram({
                code: diagramText,
                sourceFiles,
              });

              if (!result.solved || !result.code) {
                vscode.window.showWarningMessage(
                  `Mermaid AI could not regenerate ${path.basename(mmdUri.fsPath)}. No changes made.`,
                );
                return;
              }

              // Preserve existing frontmatter metadata, update generationTime
              const existingMetadata = extractMetadataFromCode(fullContent);
              const updatedContent = addMetadataToFrontmatter(result.code, {
                query: existingMetadata.query,
                references: existingMetadata.references,
                generationTime: new Date(),
              });

              await vscode.workspace.fs.writeFile(
                mmdUri,
                Buffer.from(updatedContent, 'utf-8'),
              );

              vscode.window.showInformationMessage(
                `✅ ${path.basename(mmdUri.fsPath)} updated. Remember to \`git add\` it before committing.`,
              );
            } catch (error: unknown) {
              const isCreditsError =
                error instanceof Error && error.name === 'AICreditsLimitExceededError';
              if (isCreditsError) {
                vscode.window.showErrorMessage(
                  'Mermaid AI credits limit exceeded. Please check your account at mermaid.ai.',
                );
              } else {
                vscode.window.showErrorMessage(
                  `Failed to regenerate ${path.basename(mmdUri.fsPath)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
            }
          },
        );
      },
    ),
  );
}

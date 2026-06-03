import * as vscode from 'vscode';
import * as path from 'path';
import { addMetadataToFrontmatter, splitFrontMatter, extractMetadataFromCode } from '../../frontmatter';
import { MermaidChartAuthenticationProvider } from '../../mermaidChartAuthenticationProvider';
import type { MermaidChartVSCode } from '../../mermaidChartVSCode';

/** Extracts clean Mermaid code from a markdown response that may contain a ```mermaid block. */
function extractMermaidCode(markdownText: string): string {
  const mermaidBlockRegex = /```mermaid\s*\n?([\s\S]*?)```/gi;
  const match = mermaidBlockRegex.exec(markdownText);
  return match?.[1]?.trim() ?? markdownText.trim();
}

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

              // SDK returns result: 'ok' | 'fail' — 'solved' is optional and may be absent.
              if (result.result !== 'ok' || !result.code) {
                vscode.window.showWarningMessage(
                  `Mermaid AI could not regenerate ${path.basename(mmdUri.fsPath)}. No changes made.`,
                );
                return;
              }

              // SDK documents result.code as "Markdown message that may contain a
              // valid mermaid code block." Extract the diagram before writing to disk.
              const cleanedCode = extractMermaidCode(result.code);

              // Preserve existing frontmatter metadata, update generationTime
              const existingMetadata = extractMetadataFromCode(fullContent);
              const updatedContent = addMetadataToFrontmatter(cleanedCode, {
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
              // AICreditsLimitExceededError is not exported from @mermaidchart/sdk's
              // public API surface, so we check error.name which the class sets explicitly.
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

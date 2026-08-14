import * as vscode from 'vscode';
import * as path from 'path';
import { addMetadataToFrontmatter, splitFrontMatter, extractMetadataFromCode } from '../../frontmatter';
import { MermaidChartAuthenticationProvider } from '../../mermaidChartAuthenticationProvider';
import type { MermaidChartVSCode } from '../../mermaidChartVSCode';
import { showUpgradePrompt } from '../../upgradePricing';

/** Extracts clean Mermaid code from a markdown response that may contain a ```mermaid block. */
export function extractMermaidCode(markdownText: string): string {
  const mermaidBlockRegex = /```mermaid\s*\n?([\s\S]*?)```/gi;
  const match = mermaidBlockRegex.exec(markdownText);
  return match?.[1]?.trim() ?? markdownText.trim();
}

export type RegeneratedDiagramProposal = {
  originalContent: string;
  proposedContent: string;
};

/**
 * Calls Mermaid AI regenerate and returns full file contents (with frontmatter).
 * Does not write to disk — callers decide (write-through vs review list).
 */
export async function regenerateDiagramProposal(
  mcAPI: MermaidChartVSCode,
  mmdUri: vscode.Uri,
  sourceFiles: string[],
): Promise<RegeneratedDiagramProposal | null> {
  const bytes = await vscode.workspace.fs.readFile(mmdUri);
  const fullContent = Buffer.from(bytes).toString('utf-8');
  const { diagramText } = splitFrontMatter(fullContent);

  const result = await mcAPI.regenerateDiagram({
    code: diagramText,
    sourceFiles,
  });

  // SDK returns result: 'ok' | 'fail' — 'solved' is optional and may be absent.
  if (result.result !== 'ok' || !result.code) {
    return null;
  }

  // SDK documents result.code as "Markdown message that may contain a
  // valid mermaid code block." Extract the diagram before writing to disk.
  const cleanedCode = extractMermaidCode(result.code);

  // Preserve existing frontmatter metadata, update generationTime
  const existingMetadata = extractMetadataFromCode(fullContent);
  const proposedContent = addMetadataToFrontmatter(cleanedCode, {
    query: existingMetadata.query,
    references: existingMetadata.references,
    generationTime: new Date(),
  });

  return { originalContent: fullContent, proposedContent };
}

async function handleRegenerateCreditsOrError(
  error: unknown,
  mmdUri: vscode.Uri,
): Promise<void> {
  // AICreditsLimitExceededError is not exported from @mermaidchart/sdk's
  // public API surface, so we check error.name which the class sets explicitly.
  const isCreditsError =
    error instanceof Error && error.name === 'AICreditsLimitExceededError';
  if (isCreditsError) {
    await showUpgradePrompt(
      'regenerate',
      'Mermaid AI credits limit exceeded. Please check your account at mermaid.ai.',
      'Upgrade Subscription',
    );
  } else {
    vscode.window.showErrorMessage(
      `Failed to regenerate ${path.basename(mmdUri.fsPath)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
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
              const proposal = await regenerateDiagramProposal(mcAPI, mmdUri, sourceFiles);
              if (!proposal) {
                vscode.window.showWarningMessage(
                  `Mermaid AI could not regenerate ${path.basename(mmdUri.fsPath)}. No changes made.`,
                );
                return;
              }

              await vscode.workspace.fs.writeFile(
                mmdUri,
                Buffer.from(proposal.proposedContent, 'utf-8'),
              );

              vscode.window.showInformationMessage(
                `✅ ${path.basename(mmdUri.fsPath)} updated. Remember to \`git add\` it before committing.`,
              );
            } catch (error: unknown) {
              await handleRegenerateCreditsOrError(error, mmdUri);
            }
          },
        );
      },
    ),
  );
}

import * as vscode from 'vscode';
import * as path from 'path';
import { extractMetadataFromCode } from '../../frontmatter';
import analytics from '../../analytics';
import {
  recordInteraction,
  shouldShowPrompt,
} from './interactionCooldown';
import {
  isCodingSourceFile,
  resolveReferencePath,
} from './gitStageHelpers';

/** Set to false before release — when true, toast shows every time (no globalState). */
const createDiagramFromStageAlwaysShowForTesting = true;

const PROMPT_STATE_KEY = 'createDiagramFromStage.prompt';

/**
 * Soft offer to generate a new diagram from staged coding files that have no
 * linked Mermaid diagram. Separate from staging regenerate (existing diagrams).
 */
export class CreateDiagramFromStageService {
  private static extensionContext: vscode.ExtensionContext | undefined;

  static register(context: vscode.ExtensionContext): void {
    CreateDiagramFromStageService.extensionContext = context;
  }

  /**
   * Offer generate-from-code for staged coding files that are not referenced
   * by any workspace diagram. Never blocks staging/commit.
   */
  static async maybeOffer(
    workspaceFolder: vscode.WorkspaceFolder,
    stagedSourcePaths: string[],
  ): Promise<void> {
    const context = CreateDiagramFromStageService.extensionContext;
    if (!context) {
      return;
    }

    const enabled = vscode.workspace
      .getConfiguration('mermaidChart')
      .get<boolean>('createDiagramFromStage.enabled', true);
    if (!enabled) {
      return;
    }

    const cooldownOpts = {
      globalState: context.globalState,
      stateKeyPrefix: PROMPT_STATE_KEY,
      alwaysShow: createDiagramFromStageAlwaysShowForTesting,
      maxInteractionsBeforeCooldown: 2,
    };

    if (!shouldShowPrompt(cooldownOpts)) {
      return;
    }

    const codingStaged = stagedSourcePaths.filter(isCodingSourceFile);
    if (codingStaged.length === 0) {
      return;
    }

    const referencedPaths = await CreateDiagramFromStageService.collectReferencedSourcePaths(
      workspaceFolder,
    );
    const unlinked = codingStaged.filter(
      (p) => !referencedPaths.has(path.normalize(p)),
    );
    if (unlinked.length === 0) {
      return;
    }

    const fileNames = unlinked.map((p) => path.basename(p));
    const namePreview =
      fileNames.length <= 5
        ? fileNames.join(', ')
        : `${fileNames.slice(0, 5).join(', ')} (+${fileNames.length - 5} more)`;

    analytics.trackOnCommitDiagramGenerateShown();

    const pick = await vscode.window.showInformationMessage(
      `New staged code has no Mermaid diagram ("${namePreview}").\n\nVisualize it with Generate Diagram From Code?`,
      { modal: false },
      'Generate',
      'Not now',
    );

    const decision = pick === 'Generate' ? 'accepted' : 'dismissed';
    analytics.trackOnCommitDiagramGenerationDecision(decision);
    await recordInteraction(cooldownOpts);

    if (pick !== 'Generate') {
      return;
    }

    const uris = unlinked.map((p) => vscode.Uri.file(p));
    await vscode.commands.executeCommand(
      'mermaidChart.generateDiagramFromCode',
      uris,
    );
  }

  /** Absolute paths referenced by any .mmd/.mermaid frontmatter in the workspace. */
  private static async collectReferencedSourcePaths(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<Set<string>> {
    const referenced = new Set<string>();
    const mmdUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/*.{mmd,mermaid}'),
    );

    for (const mmdUri of mmdUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(mmdUri);
        const text = Buffer.from(bytes).toString('utf-8');
        const metadata = extractMetadataFromCode(text);
        if (!metadata.references || metadata.references.length === 0) {
          continue;
        }
        for (const ref of metadata.references) {
          const refPath = resolveReferencePath(ref, workspaceFolder.uri.fsPath);
          if (refPath) {
            referenced.add(path.normalize(refPath));
          }
        }
      } catch (error) {
        console.error(
          { mmdUri: mmdUri.fsPath, error },
          'CreateDiagramFromStage: failed to read diagram file',
        );
      }
    }

    return referenced;
  }
}

import * as vscode from "vscode";
import * as path from "path";
import analytics from "../../analytics";
import {
  addMetadataToFrontmatter,
  extractMetadataFromCode,
  splitFrontMatter,
} from "../../frontmatter";
import { MermaidChartAuthenticationProvider } from "../../mermaidChartAuthenticationProvider";
import type { MermaidChartVSCode } from "../../mermaidChartVSCode";
import { openDiagramDiffWebviews } from "../sync/diagramDiffView";
import { getSyncScope } from "../config/syncConfigService";

/**
 * Step 4 / Slice 7 — pre-emptive local sync.
 *
 * Runs the Sync Assistant's regeneration LOCALLY so an author sees a connected
 * diagram update while writing the PR, not after it's opened. Feasibility (the
 * gating step of the prompt) is satisfied because regeneration is the
 * `mcAPI.regenerateDiagram` server call, which the extension already invokes
 * client-side; we call it directly so we can present a draft instead of writing.
 *
 * Flow: on save of an in-scope source file that a diagram references, offer a
 * preview (gated so we never burn AI credits silently). On accept we regenerate,
 * show the change on the landed Slice 2.A diff surface, and present a draft with
 * Accept / Edit / Reject. Nothing is written without the author's action.
 *
 * Off by default — it costs AI credits and is the most intrusive surface.
 */

const ENABLE_SETTING = "localSync.enabled";

interface ConnectedDiagram {
  mmdUri: vscode.Uri;
  mmdName: string;
}

export class LocalSyncService {
  /** Debounce per source file so rapid saves don't stack prompts. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Files with a prompt already in flight, to avoid duplicate notifications. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly mcAPI: MermaidChartVSCode,
  ) {}

  private enabled(): boolean {
    return vscode.workspace
      .getConfiguration("mermaidChart")
      .get<boolean>(ENABLE_SETTING, false);
  }

  start(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSave(doc)),
    );
  }

  private onSave(doc: vscode.TextDocument): void {
    if (!this.enabled() || doc.uri.scheme !== "file") {
      return;
    }
    const fsPath = doc.uri.fsPath;
    if (fsPath.endsWith(".mmd") || fsPath.endsWith(".mermaid")) {
      return; // Only source-file saves drive a regeneration.
    }
    const existing = this.timers.get(fsPath);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      fsPath,
      setTimeout(() => void this.handleSave(doc.uri), 800),
    );
  }

  private async handleSave(uri: vscode.Uri): Promise<void> {
    this.timers.delete(uri.fsPath);
    if (this.inFlight.has(uri.fsPath)) {
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return;
    }
    if (!(await this.inSyncScope(folder, uri))) {
      return;
    }
    const connected = await this.findConnectedDiagrams(folder, uri);
    if (connected.length === 0) {
      return;
    }

    analytics.sendEvent("Local Sync Shown", "VS_CODE_PLUGIN_LOCAL_SYNC_SHOWN");

    const PREVIEW = "Preview update";
    const NOT_NOW = "Not now";
    const name = connected.map((c) => c.mmdName).join(", ");
    const pick = await vscode.window.showInformationMessage(
      `Code in ${path.basename(uri.fsPath)} changed. Preview the updated diagram (${name})?`,
      { modal: false },
      PREVIEW,
      NOT_NOW,
    );
    if (pick !== PREVIEW) {
      return;
    }

    this.inFlight.add(uri.fsPath);
    try {
      for (const diagram of connected) {
        await this.previewRegeneration(diagram, uri);
      }
    } finally {
      this.inFlight.delete(uri.fsPath);
    }
  }

  /** True when the saved file matches sync.include and not sync.exclude / ignore. */
  private async inSyncScope(folder: vscode.WorkspaceFolder, uri: vscode.Uri): Promise<boolean> {
    const scope = await getSyncScope();
    if (scope.include.length === 0) {
      return false; // Quiet until a sync scope is configured (Slice 6).
    }
    const includeGlob = new vscode.RelativePattern(folder, `{${scope.include.join(",")}}`);
    const excludeGlob =
      scope.exclude.length > 0
        ? new vscode.RelativePattern(folder, `{${scope.exclude.join(",")}}`)
        : null;
    const matched = await vscode.workspace.findFiles(includeGlob, excludeGlob);
    const target = path.normalize(uri.fsPath);
    return matched.some((u) => path.normalize(u.fsPath) === target);
  }

  /** Diagrams whose frontmatter references the saved source file. */
  private async findConnectedDiagrams(
    folder: vscode.WorkspaceFolder,
    sourceUri: vscode.Uri,
  ): Promise<ConnectedDiagram[]> {
    const mmdUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/*.{mmd,mermaid}"),
    );
    const target = path.normalize(sourceUri.fsPath);
    const connected: ConnectedDiagram[] = [];

    for (const mmdUri of mmdUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(mmdUri);
        const metadata = extractMetadataFromCode(Buffer.from(bytes).toString("utf-8"));
        for (const ref of metadata.references ?? []) {
          const resolved = resolveReferencePath(ref, folder.uri.fsPath);
          if (resolved && path.normalize(resolved) === target) {
            connected.push({ mmdUri, mmdName: path.basename(mmdUri.fsPath) });
            break;
          }
        }
      } catch {
        // Unreadable diagram — ignore.
      }
    }
    return connected;
  }

  /**
   * Regenerate locally and present the result as a draft on the diff surface.
   * Writes only when the author accepts.
   */
  private async previewRegeneration(diagram: ConnectedDiagram, sourceUri: vscode.Uri): Promise<void> {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true },
    );
    if (!session) {
      const pick = await vscode.window.showInformationMessage(
        "Sign in to Mermaid Chart to preview a local diagram update.",
        "Login",
      );
      if (pick === "Login") {
        await this.mcAPI.login();
      }
      return;
    }

    const oldContent = await readText(diagram.mmdUri);
    const sourceContext = await this.buildSourceContext(sourceUri);
    const { diagramText } = splitFrontMatter(oldContent);

    let newContent: string | undefined;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Regenerating ${diagram.mmdName} locally…`,
        cancellable: false,
      },
      async () => {
        try {
          const result = await this.mcAPI.regenerateDiagram({
            code: diagramText,
            sourceFiles: [sourceContext],
          });
          if (result?.result !== "ok" || !result.code) {
            vscode.window.showWarningMessage(
              `Mermaid AI couldn't update ${diagram.mmdName}. No changes made.`,
            );
            return;
          }
          const cleaned = extractMermaidCode(result.code);
          const existingMetadata = extractMetadataFromCode(oldContent);
          newContent = addMetadataToFrontmatter(cleaned, {
            query: existingMetadata.query,
            references: existingMetadata.references,
            generationTime: new Date(),
          });
        } catch (error: unknown) {
          const isCredits = error instanceof Error && error.name === "AICreditsLimitExceededError";
          vscode.window.showErrorMessage(
            isCredits
              ? "Mermaid AI credits limit exceeded. Check your account at mermaid.ai."
              : `Failed to regenerate ${diagram.mmdName}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );

    if (!newContent) {
      return;
    }
    await this.presentDraft(diagram, oldContent, newContent);
  }

  private async presentDraft(
    diagram: ConnectedDiagram,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    // Reuse the landed Slice 2.A diff surface — before/after previews.
    const closeDiff = openDiagramDiffWebviews(oldContent, newContent);

    const ACCEPT = "Accept";
    const EDIT = "Edit";
    const REJECT = "Reject";
    const pick = await vscode.window.showInformationMessage(
      `Updated draft for ${diagram.mmdName}. Apply it?`,
      { modal: false },
      ACCEPT,
      EDIT,
      REJECT,
    );

    if (pick === ACCEPT) {
      await vscode.workspace.fs.writeFile(diagram.mmdUri, Buffer.from(newContent, "utf-8"));
      analytics.sendEvent("Local Sync Accepted", "VS_CODE_PLUGIN_LOCAL_SYNC_ACCEPTED");
      vscode.window.showInformationMessage(
        `✅ ${diagram.mmdName} updated. Remember to \`git add\` it before committing.`,
      );
      closeDiff();
    } else if (pick === EDIT) {
      // Open the draft as an unsaved document so the author tweaks before saving —
      // never auto-writes the original .mmd.
      const draft = await vscode.workspace.openTextDocument({
        language: "mermaid",
        content: newContent,
      });
      await vscode.window.showTextDocument(draft, { preview: false });
      analytics.sendEvent("Local Sync Accepted", "VS_CODE_PLUGIN_LOCAL_SYNC_ACCEPTED");
      closeDiff();
    } else {
      closeDiff();
    }
  }

  private async buildSourceContext(sourceUri: vscode.Uri): Promise<string> {
    const content = await readText(sourceUri);
    const folder = vscode.workspace.getWorkspaceFolder(sourceUri);
    const rel = folder
      ? path.relative(folder.uri.fsPath, sourceUri.fsPath).replace(/\\/g, "/")
      : sourceUri.fsPath;
    return `=== SOURCE FILE: ${rel} ===\n${content}`;
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf-8");
}

/** Extract clean Mermaid code from a markdown response that may wrap a code block. */
function extractMermaidCode(markdownText: string): string {
  const mermaidBlockRegex = /```mermaid\s*\n?([\s\S]*?)```/gi;
  const match = mermaidBlockRegex.exec(markdownText);
  return match?.[1]?.trim() ?? markdownText.trim();
}

/** Resolve a `.mmd` "File: /src/x.ts" reference to an absolute path. */
function resolveReferencePath(reference: string, workspacePath: string): string | undefined {
  const match = reference.match(/File: (.*?)(\s|$|\()/);
  if (!match) {
    return undefined;
  }
  const filePath = match[1].trim();
  if (!filePath.includes("/") && !filePath.includes("\\")) {
    return undefined;
  }
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    return path.normalize(filePath);
  }
  const relative = filePath.replace(/^[/\\]+/, "");
  return path.normalize(path.join(workspacePath, relative));
}

export function registerLocalSync(
  context: vscode.ExtensionContext,
  mcAPI: MermaidChartVSCode,
): void {
  const service = new LocalSyncService(context, mcAPI);
  service.start();
}

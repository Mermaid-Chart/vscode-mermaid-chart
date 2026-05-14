import * as vscode from "vscode";
import * as path from "path";
import { BotReviewIntegration, type ReviewFileMapping } from "./botReviewIntegration";

/** Purple tint in the explorer for in-review files and their parent folders (no badge/icons on names). */
const REVIEW_PURPLE = new vscode.ThemeColor("charts.purple");

export class BotFileDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private parentFolderToMappings: Map<string, ReviewFileMapping[]> | null = null;

  constructor(private readonly botReviewIntegration: BotReviewIntegration) {}

  private getParentFolderToMappings(): Map<string, ReviewFileMapping[]> {
    if (!this.parentFolderToMappings) {
      const m = new Map<string, ReviewFileMapping[]>();
      for (const mapping of this.botReviewIntegration.getReviewMappings().values()) {
        const parent = path.normalize(path.dirname(mapping.originalFilePath));
        const list = m.get(parent);
        if (list) {
          list.push(mapping);
        } else {
          m.set(parent, [mapping]);
        }
      }
      this.parentFolderToMappings = m;
    }
    return this.parentFolderToMappings;
  }

  private fileTooltip(mapping: ReviewFileMapping): string {
    switch (mapping.status) {
      case "pending":
        return "Mermaid Diagram Sync — bot review pending (see CodeLens in editor)";
      case "modified":
        return "Mermaid Diagram Sync — bot review (modified; see CodeLens)";
      case "accepted":
        return "Mermaid Diagram Sync — bot review accepted (see CodeLens)";
      case "rejected":
        return "Mermaid Diagram Sync — bot review reverted to pre-bot (see CodeLens)";
      default:
        return "Mermaid Diagram Sync — bot review";
    }
  }

  private folderTooltip(mappings: ReviewFileMapping[]): string {
    const n = mappings.length;
    const names = mappings.map((x) => path.basename(x.originalFilePath));
    const preview = names.slice(0, 3).join(", ");
    const suffix = names.length > 3 ? ` (+${names.length - 3} more)` : "";
    return `Mermaid Diagram Sync — ${n} diagram(s) in bot review in this folder: ${preview}${suffix}`;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== "file") {
      return undefined;
    }
    const normalized = path.normalize(uri.fsPath);

    const mapping = this.botReviewIntegration.getReviewMapping(normalized);
    if (mapping) {
      return {
        color: REVIEW_PURPLE,
        tooltip: this.fileTooltip(mapping),
        propagate: false,
      };
    }

    const folderChildren = this.getParentFolderToMappings().get(normalized);
    if (folderChildren?.length) {
      return {
        color: REVIEW_PURPLE,
        tooltip: this.folderTooltip(folderChildren),
        propagate: false,
      };
    }

    return undefined;
  }

  refresh(): void {
    this.parentFolderToMappings = null;
    const parents = new Set<string>();
    for (const key of this.botReviewIntegration.getReviewMappings().keys()) {
      this._onDidChangeFileDecorations.fire(vscode.Uri.file(key));
      parents.add(path.normalize(path.dirname(key)));
    }
    for (const p of parents) {
      this._onDidChangeFileDecorations.fire(vscode.Uri.file(p));
    }
    this._onDidChangeFileDecorations.fire(undefined);
  }

  updateFileStatus(
    originalFilePath: string,
    status: "pending" | "accepted" | "rejected" | "modified"
  ): void {
    const mapping = this.botReviewIntegration.getReviewMapping(path.normalize(originalFilePath));
    if (mapping) {
      mapping.status = status;
      this.parentFolderToMappings = null;
      const uri = vscode.Uri.file(originalFilePath);
      this._onDidChangeFileDecorations.fire(uri);
      this._onDidChangeFileDecorations.fire(vscode.Uri.file(path.normalize(path.dirname(originalFilePath))));
    }
  }

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }
}

import * as vscode from "vscode";
import * as path from "path";
import { AppReviewIntegration, type ReviewFileMapping } from "./appReviewIntegration";
import {
  findMapKeyForRelativePath,
  relativePathFromAbsolute,
  repoRelativeParentDir,
} from "./appReviewPaths";
import { reviewStatusDecoration, toReviewTreeUri, fsPathFromReviewUri } from "./appReviewStatus";

/** Purple tint for parent folders that contain in-review diagram files. */
const REVIEW_PURPLE = new vscode.ThemeColor("charts.purple");

export class AppFileDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private parentFolderToMappings: Map<string, ReviewFileMapping[]> | null = null;

  constructor(private readonly appReviewIntegration: AppReviewIntegration) {}

  private getParentFolderToMappings(): Map<string, ReviewFileMapping[]> {
    if (!this.parentFolderToMappings) {
      const m = new Map<string, ReviewFileMapping[]>();
      for (const mapping of this.appReviewIntegration.getReviewMappings().values()) {
        const parent = repoRelativeParentDir(mapping.relativePath);
        if (!parent) {
          continue;
        }
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
        return "Mermaid Diagram Sync — app review pending (see CodeLens in editor)";
      case "modified":
        return "Mermaid Diagram Sync — app review (modified; see CodeLens)";
      case "accepted":
        return "Mermaid Diagram Sync — app review accepted (see CodeLens)";
      case "rejected":
        return "Mermaid Diagram Sync — app review reverted to pre-app (see CodeLens)";
      default:
        return "Mermaid Diagram Sync — app review";
    }
  }

  private folderTooltip(mappings: ReviewFileMapping[]): string {
    const n = mappings.length;
    const names = mappings.map((x) => path.basename(x.originalFilePath));
    const preview = names.slice(0, 3).join(", ");
    const suffix = names.length > 3 ? ` (+${names.length - 3} more)` : "";
    return `Mermaid Diagram Sync — ${n} diagram(s) in app review in this folder: ${preview}${suffix}`;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const reviewTreePath = fsPathFromReviewUri(uri);
    if (reviewTreePath) {
      const mapping = this.appReviewIntegration.getReviewMapping(reviewTreePath);
      if (mapping) {
        const status = reviewStatusDecoration(mapping.status);
        return {
          badge: status.badge,
          color: status.color,
          tooltip: this.fileTooltip(mapping),
          propagate: false,
        };
      }
      return undefined;
    }

    if (uri.scheme !== "file") {
      return undefined;
    }

    const mapping = this.appReviewIntegration.getReviewMapping(uri.fsPath);
    if (mapping) {
      // Explorer: purple tint only — badges live on the Review Mermaid Sync tree (custom URI).
      return {
        color: REVIEW_PURPLE,
        tooltip: this.fileTooltip(mapping),
        propagate: false,
      };
    }

    const gitRoot = this.appReviewIntegration.getActiveGitRoot();
    if (gitRoot) {
      const relDir = relativePathFromAbsolute(gitRoot, uri.fsPath);
      if (relDir) {
        const parentMap = this.getParentFolderToMappings();
        const folderKey = findMapKeyForRelativePath(parentMap.keys(), relDir);
        const folderChildren = folderKey ? parentMap.get(folderKey) : undefined;
        if (folderChildren?.length) {
          return {
            color: REVIEW_PURPLE,
            tooltip: this.folderTooltip(folderChildren),
            propagate: false,
          };
        }
      }
    }

    return undefined;
  }

  refresh(): void {
    this.parentFolderToMappings = null;
    const uris: vscode.Uri[] = [];
    for (const mapping of this.appReviewIntegration.getReviewMappings().values()) {
      uris.push(vscode.Uri.file(mapping.originalFilePath));
      uris.push(toReviewTreeUri(mapping.originalFilePath));
      uris.push(vscode.Uri.file(path.dirname(mapping.originalFilePath)));
    }
    for (const uri of uris) {
      this._onDidChangeFileDecorations.fire(uri);
    }
    this._onDidChangeFileDecorations.fire(undefined);
  }

  updateFileStatus(
    originalFilePath: string,
    status: "pending" | "accepted" | "rejected" | "modified"
  ): void {
    const mapping = this.appReviewIntegration.getReviewMapping(originalFilePath);
    if (mapping) {
      mapping.status = status;
      this.parentFolderToMappings = null;
      const uri = vscode.Uri.file(mapping.originalFilePath);
      this._onDidChangeFileDecorations.fire(uri);
      this._onDidChangeFileDecorations.fire(toReviewTreeUri(mapping.originalFilePath));
      this._onDidChangeFileDecorations.fire(
        vscode.Uri.file(path.dirname(mapping.originalFilePath))
      );
    }
  }

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }
}

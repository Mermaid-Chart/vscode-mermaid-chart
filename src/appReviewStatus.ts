import * as vscode from "vscode";
import type { ReviewFileMapping } from "./appReviewIntegration";

/** Tree-only URI scheme so Git SCM decorations (M) do not stack on review status badges. */
export const MERMAID_REVIEW_URI_SCHEME = "mermaid-review";

export function toReviewTreeUri(absoluteFilePath: string): vscode.Uri {
  return vscode.Uri.file(absoluteFilePath).with({ scheme: MERMAID_REVIEW_URI_SCHEME });
}

export function fsPathFromReviewUri(uri: vscode.Uri): string | null {
  if (uri.scheme !== MERMAID_REVIEW_URI_SCHEME) {
    return null;
  }
  return uri.fsPath;
}

/** Tree/context URIs use `mermaid-review:`; review commands need the workspace file URI. */
export function resolveReviewDiagramUri(uri?: vscode.Uri): vscode.Uri | undefined {
  if (!uri) {
    return undefined;
  }
  const fsPath = uri.scheme === MERMAID_REVIEW_URI_SCHEME ? fsPathFromReviewUri(uri) : uri.fsPath;
  return fsPath ? vscode.Uri.file(fsPath) : undefined;
}

/** Git-style letter + theme color for a review file status. */
export function reviewStatusDecoration(status: ReviewFileMapping["status"]): {
  badge: string;
  color: vscode.ThemeColor;
  label: string;
} {
  switch (status) {
    case "accepted":
      return {
        badge: "A",
        color: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
        label: "Accepted",
      };
    case "rejected":
      return {
        badge: "R",
        color: new vscode.ThemeColor("gitDecoration.deletedResourceForeground"),
        label: "Rejected",
      };
    case "modified":
      return {
        badge: "M",
        color: new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
        label: "Modified",
      };
    case "pending":
    default:
      return {
        badge: "M",
        color: new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
        label: "Modified",
      };
  }
}

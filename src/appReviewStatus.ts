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

/** Toast wording per review origin — "local" is a local Mermaid AI regenerate, not the GitHub app. */
export function reviewOriginWording(origin: ReviewFileMapping["origin"]): {
  /** Change source, as in "<source> changes applied to flow.mmd". */
  source: string;
  /** Undone event, as in "restored to the version from before the <event>". */
  event: string;
} {
  return origin === "local"
    ? { source: "Mermaid AI", event: "Mermaid AI regenerate" }
    : { source: "Mermaid Sync app", event: "Mermaid Sync app update" };
}

/** Git-style letter + theme color for a review file status. */
export function reviewStatusDecoration(mapping: Pick<ReviewFileMapping, "status" | "origin">): {
  badge: string;
  color: vscode.ThemeColor;
  label: string;
} {
  // Local regenerate proposals are already written to the file, so pending reads as added.
  if (mapping.origin === "local" && mapping.status === "pending") {
    return {
      badge: "A",
      color: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
      label: "Added",
    };
  }

  switch (mapping.status) {
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

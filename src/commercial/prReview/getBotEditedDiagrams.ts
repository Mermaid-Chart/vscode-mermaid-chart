import * as vscode from "vscode";
import { BotEditDetector, BotEditInfo } from "./botEditDetector";
import { BotEditContentProvider } from "./botEditContentProvider";
import {
    DiagramDiffCounts,
    diffNodes,
    summarizeNodeDiff,
} from "./diagramNodeDiff";
import { isReviewed } from "./reviewActions";

/**
 * Slice 3 — single isolated detection seam for the multi-diagram review
 * sidebar. Returns one {@link DiagramReviewItem} per `.mmd`/`.mermaid`
 * file the Mermaid Sync bot touched on the current branch / working tree.
 *
 * **Why a single function.** The Slice 3 prototype scans the working tree
 * (the simpler path that matches the ~2-week estimate). Swapping to a
 * full commit-range walk later should be a one-file change: keep all
 * detection logic behind {@link getBotEditedDiagrams} and the tree
 * provider never has to learn how the set is computed.
 */

export interface DiagramReviewItem {
    uri: vscode.Uri;
    info: BotEditInfo;
    /** File name only, e.g. `payments.mmd`. */
    fileName: string;
    /** Workspace-relative path, shown as the row description. */
    relativePath: string;
    /**
     * Node-level diff stats (added / changed / removed) so the dev can
     * triage from the list without opening each diagram. Undefined when
     * the bot commit has no parent or the parent blob can't be read.
     */
    counts?: DiagramDiffCounts;
    /** Driven by the shared `workspaceState` "reviewed" flag. */
    reviewed: boolean;
}

/**
 * Scan the working tree for bot-edited diagrams. The detector caches by
 * `uri+sha`, so repeated calls are cheap; we cap the search to keep the
 * panel responsive in large repos.
 */
export async function getBotEditedDiagrams(
    detector: BotEditDetector,
    context: vscode.ExtensionContext,
    maxFiles = 50,
): Promise<DiagramReviewItem[]> {
    const uris = await vscode.workspace.findFiles(
        "**/*.{mmd,mermaid}",
        "**/node_modules/**",
        maxFiles,
    );

    const items: DiagramReviewItem[] = [];
    for (const uri of uris) {
        let info: BotEditInfo | null = null;
        try {
            info = await detector.detect(uri);
        } catch {
            // Skip any file the detector can't read.
            continue;
        }
        if (!info) {
            continue;
        }
        items.push({
            uri,
            info,
            fileName: basename(uri),
            relativePath: vscode.workspace.asRelativePath(uri, false),
            counts: await computeCounts(uri, info),
            reviewed: isReviewed(context, uri, info),
        });
    }

    // Unreviewed first (that's the work), then alphabetical by path so the
    // list is stable across refreshes.
    items.sort((a, b) => {
        if (a.reviewed !== b.reviewed) {
            return a.reviewed ? 1 : -1;
        }
        return a.relativePath.localeCompare(b.relativePath);
    });

    return items;
}

async function computeCounts(
    uri: vscode.Uri,
    info: BotEditInfo,
): Promise<DiagramDiffCounts | undefined> {
    if (!info.parentSha) {
        return undefined;
    }
    try {
        const oldUri = BotEditContentProvider.buildUri(uri, info.parentSha);
        const oldDoc = await vscode.workspace.openTextDocument(oldUri);
        const newDoc = await vscode.workspace.openTextDocument(uri);
        return summarizeNodeDiff(diffNodes(oldDoc.getText(), newDoc.getText()));
    } catch {
        return undefined;
    }
}

function basename(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.fsPath;
}

/** Compact stats label for a row description, e.g. `+3 ~1 −2`. */
export function formatCompactCounts(counts: DiagramDiffCounts): string {
    const parts: string[] = [];
    if (counts.added > 0) {
        parts.push(`+${counts.added}`);
    }
    if (counts.modified > 0) {
        parts.push(`~${counts.modified}`);
    }
    if (counts.removed > 0) {
        parts.push(`−${counts.removed}`);
    }
    return parts.length > 0 ? parts.join(" ") : "no node changes";
}

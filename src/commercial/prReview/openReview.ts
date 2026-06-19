import * as vscode from "vscode";
import * as path from "path";
import analytics from "../../analytics";
import {
    openDiagramDiffWebviews,
    openReviewDiagramPreview,
} from "../sync/diagramDiffView";
import { computeReviewSurfaceDiff } from "../sync/diagramDiffHighlighter";
import { BotEditDetector, BotEditInfo } from "./botEditDetector";
import { BotEditContentProvider } from "./botEditContentProvider";
import { acceptReview, commitEdits, editReview, rejectReview } from "./reviewActions";

export const ACCEPT_COMMAND = "mermaidChart.prReview.accept";
export const REJECT_COMMAND = "mermaidChart.prReview.reject";
export const EDIT_COMMAND = "mermaidChart.prReview.edit";
export const COMMIT_EDITS_COMMAND = "mermaidChart.prReview.commitEdits";

interface ReviewSession {
    uri: vscode.Uri;
    info: BotEditInfo;
    closePanels: () => void;
}

let activeSession: ReviewSession | undefined;

/**
 * Open the PR-review surface for `uri`:
 *
 * Default: full-size **Now** diagram with added (green) and changed (amber)
 * outlines, summary chips, collapsed changes list, and a Now/Before toggle.
 * Removed nodes appear in counts / list only — not on the diagram.
 *
 * Opt-in: "Compare side by side" opens the stacked before/after preview path.
 * Accept / Reject / Edit remain on the editor title bar.
 */
export async function openReview(
    context: vscode.ExtensionContext,
    detector: BotEditDetector,
    contentProvider: BotEditContentProvider,
    uri: vscode.Uri,
): Promise<void> {
  try {
    const info = await detector.detect(uri);
    if (!info) {
        vscode.window.showInformationMessage(
            "No bot edit detected for this file.",
        );
        return;
    }
    if (!info.parentSha) {
        vscode.window.showInformationMessage(
            `Bot commit ${info.shortSha} has no parent in this branch — nothing to compare.`,
        );
        return;
    }

    analytics.sendEvent(
        "VS Code PR Review Banner Clicked",
        "VS_CODE_PLUGIN_PR_REVIEW_BANNER_CLICKED",
    );

    let oldContent = "";
    let newContent = "";
    try {
        const oldVirtualUri = BotEditContentProvider.buildUri(uri, info.parentSha);
        const oldDoc = await vscode.workspace.openTextDocument(oldVirtualUri);
        oldContent = oldDoc.getText();

        const newDoc = await vscode.workspace.openTextDocument(uri);
        newContent = newDoc.getText();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Couldn't load diagram history: ${msg}`);
        return;
    }

    const surface = await computeReviewSurfaceDiff(oldContent, newContent);
    const fileName = path.basename(uri.fsPath);

    activeSession?.closePanels();

    let splitDispose: (() => void) | undefined;
    const openSideBySide = (): void => {
        splitDispose?.();
        splitDispose = openDiagramDiffWebviews(oldContent, newContent);
    };

    const preview = await openReviewDiagramPreview(
        {
            addedNodeIds: surface.addedNodeIds,
            modifiedNodeIds: surface.modifiedNodeIds,
            removedNodeIds: surface.removedNodeIds,
            counts: surface.counts,
            changes: surface.changes,
            astAvailable: surface.astAvailable,
            oldContent,
            fileName,
            reviewRef: info.prRef,
            onCompareSideBySide: openSideBySide,
        },
        newContent,
        vscode.ViewColumn.Active,
    );

    const closePanels = (): void => {
        try { preview.dispose(); } catch { /* best-effort */ }
        try { splitDispose?.(); } catch { /* best-effort */ }
        splitDispose = undefined;
    };

    preview.panel?.onDidDispose(() => {
        if (activeSession?.closePanels === closePanels) {
            activeSession = undefined;
        }
    });

    activeSession = { uri, info, closePanels };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PR Review] openReview failed:", err);
    vscode.window.showErrorMessage(`Mermaid PR Review failed to open: ${msg}`);
  }
}

/**
 * Resolve the {uri, info} pair an action should operate on.
 */
async function resolveTargetForAction(
    detector: BotEditDetector,
    uriArg?: vscode.Uri,
): Promise<{ uri: vscode.Uri; info: BotEditInfo; closePanels: () => void } | undefined> {
    const uri =
        uriArg ??
        activeSession?.uri ??
        vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
        vscode.window.showWarningMessage(
            "PR Review: open a synced .mmd file first.",
        );
        return undefined;
    }
    if (activeSession && activeSession.uri.toString() === uri.toString()) {
        return {
            uri: activeSession.uri,
            info: activeSession.info,
            closePanels: () => {
                activeSession?.closePanels();
                activeSession = undefined;
            },
        };
    }
    const info = await detector.detect(uri);
    if (!info) {
        vscode.window.showInformationMessage(
            "No bot edit detected for this file.",
        );
        return undefined;
    }
    return {
        uri,
        info,
        closePanels: () => {
            if (activeSession && activeSession.uri.toString() === uri.toString()) {
                activeSession.closePanels();
                activeSession = undefined;
            }
        },
    };
}

export function registerReviewCommands(
    context: vscode.ExtensionContext,
    detector: BotEditDetector,
    contentProvider: BotEditContentProvider,
): vscode.Disposable[] {
    return [
        vscode.workspace.registerTextDocumentContentProvider(
            BotEditContentProvider.scheme,
            contentProvider,
        ),
        vscode.commands.registerCommand(ACCEPT_COMMAND, async (uriArg?: vscode.Uri) => {
            const target = await resolveTargetForAction(detector, uriArg);
            if (!target) { return; }
            await acceptReview(context, target.uri, target.info, target.closePanels);
        }),
        vscode.commands.registerCommand(REJECT_COMMAND, async (uriArg?: vscode.Uri) => {
            const target = await resolveTargetForAction(detector, uriArg);
            if (!target) { return; }
            await rejectReview(target.uri, target.info, target.closePanels);
        }),
        vscode.commands.registerCommand(EDIT_COMMAND, async (uriArg?: vscode.Uri) => {
            const target = await resolveTargetForAction(detector, uriArg);
            if (!target) { return; }
            await editReview(target.uri, target.info, target.closePanels);
        }),
        vscode.commands.registerCommand(COMMIT_EDITS_COMMAND, async (uriArg?: vscode.Uri) => {
            const target = await resolveTargetForAction(detector, uriArg);
            if (!target) { return; }
            await commitEdits(context, target.uri, target.info);
        }),
    ];
}

export const REVIEW_ACTION_COMMANDS = {
    accept: ACCEPT_COMMAND,
    reject: REJECT_COMMAND,
    edit: EDIT_COMMAND,
};

import * as vscode from "vscode";
import * as path from "path";
import analytics from "../../analytics";
import { openSingleDiagramPreview } from "../sync/diagramDiffView";
import { BotEditDetector, BotEditInfo } from "./botEditDetector";
import { BotEditContentProvider } from "./botEditContentProvider";
import { diffNodes } from "./diagramNodeDiff";
import { acceptReview, commitEdits, editReview, rejectReview } from "./reviewActions";
import { openReviewSurfaceWebview } from "./reviewSurfaceWebview";
import { showUpsellModal } from "./proFeatureUpsell";

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
 * Open the Slice 2 PR-review surface for `uri`:
 *
 * 1. Read the parent-commit blob via `BotEditContentProvider`.
 * 2. Render the source diff in VS Code's built-in diff editor (left pane).
 * 3. Render the two preview webviews stacked on the right (current top,
 *    updated bottom) — node-level highlight on added IDs.
 * 4. Wire Accept / Reject / Edit commands to the active session.
 */
export async function openReview(
    context: vscode.ExtensionContext,
    detector: BotEditDetector,
    contentProvider: BotEditContentProvider,
    uri: vscode.Uri,
): Promise<void> {
  // Wrapping the whole body so any unhandled throw becomes a visible
  // error message instead of being swallowed by the command runner.
  // Costs nothing and makes future regressions self-diagnosing.
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

    const { addedNodeIds, removedNodeIds } = diffNodes(oldContent, newContent);
    const fileName = path.basename(uri.fsPath);

    // Close any previous review session first so we don't accumulate panels.
    activeSession?.closePanels();

    // Detect Mermaid Chart sign-in (silent, no popup) so the surface can
    // render the logged-in extras block in the right state. We don't gate
    // the review itself behind sign-in — the carrot is visible either way.
    let isSignedIn = false;
    try {
        const session = await vscode.authentication.getSession(
            "mermaidchart",
            [],
            { silent: true },
        );
        isSignedIn = !!session;
    } catch { /* assume signed out */ }

    // Pre-split the workspace into two columns *before* we create either
    // panel — that way each panel lands in its assigned column with no
    // race against the layout reflow, and the foreground tab in each
    // column is the one we just created (not whatever was there before).
    await vscode.commands.executeCommand("vscode.setEditorLayout", {
        orientation: 0,
        groups: [{ size: 0.55 }, { size: 0.45 }],
    });

    // Left (column 1): custom surface webview (banner + diff + footer
    // with flat equal-weight buttons).
    const surfacePanel = openReviewSurfaceWebview(
        info,
        fileName,
        oldContent,
        newContent,
        async (action) => {
            if (action === "accept") {
                await vscode.commands.executeCommand(ACCEPT_COMMAND, uri);
            } else if (action === "reject") {
                await vscode.commands.executeCommand(REJECT_COMMAND, uri);
            } else if (action === "edit") {
                await vscode.commands.executeCommand(EDIT_COMMAND, uri);
            }
        },
        {
            isSignedIn,
            onSignInRequest: () => {
                void vscode.commands.executeCommand("mermaidChart.login");
            },
            onLockedFeatureClicked: (featureId) => {
                void showUpsellModal(featureId);
            },
        },
    );

    // Right (column 2): single Mermaid preview with the bot-added nodes
    // outlined in the theme's git-added color.
    const previewTitle = `Visual preview · ${fileName}`;
    const preview = openSingleDiagramPreview(
        newContent,
        previewTitle,
        { addedNodeIds, removedNodeIds },
        vscode.ViewColumn.Two,
    );

    // Force the surface to be the foreground tab in column 1 so the
    // user sees it immediately — `createWebviewPanel` doesn't always
    // beat the existing .mmd tab to the front.
    surfacePanel.reveal(vscode.ViewColumn.One, false);

    const closePanels = (): void => {
        try { surfacePanel.dispose(); } catch { /* best-effort */ }
        try { preview.dispose(); } catch { /* best-effort */ }
    };
    surfacePanel.onDidDispose(() => {
        if (activeSession?.closePanels === closePanels) {
            activeSession = undefined;
        }
    });

    activeSession = { uri, info, closePanels };

    // Suppress unused-variable warning for removedNodeIds — Slice 4 will
    // surface removals; for now they're computed and forwarded but the
    // single-pane preview only outlines additions.
    void removedNodeIds;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PR Review] openReview failed:", err);
    vscode.window.showErrorMessage(`Mermaid PR Review failed to open: ${msg}`);
  }
}

/**
 * Resolve the {uri, info} pair an action should operate on.
 *
 * Priority: explicit `uriArg` from the CodeLens button → active review
 * session → the active text editor. Detection is re-run for the resolved
 * URI so action commands work even when the user hasn't first clicked the
 * Review banner (i.e. they invoke Accept directly from the CodeLens).
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

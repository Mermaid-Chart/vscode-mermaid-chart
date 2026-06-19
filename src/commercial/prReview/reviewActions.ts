import * as vscode from "vscode";
import type { API as GitAPI, GitExtension } from "../../types/git";
import analytics from "../../analytics";
import { BotEditInfo } from "./botEditDetector";

const REVIEWED_KEY = "mermaidChart.prReview.reviewed";

/**
 * Side-effects that wire the Accept / Reject / Edit affordances to actual
 * workspace and git operations.
 *
 * "Reject" is the only action with destructive force — it asks for explicit
 * confirmation and writes the parent-commit blob back to the working tree.
 *
 * Slice 5 graduates "Edit" to a full three-state edit mode: entering edit mode
 * swaps the review banner for an unambiguous Restore original / Cancel / Save
 * affordance (see {@link BotEditCodeLensProvider}). Each state reuses existing
 * plumbing — Restore original → {@link rejectReview}, Save → {@link commitEdits},
 * Cancel → {@link cancelEdit} — so the editor is never forked.
 */

/**
 * URIs currently in edit mode. The CodeLens banner reads this to decide whether
 * to show the review affordance or the three-state edit affordance.
 */
const editModeUris = new Set<string>();
const editModeEmitter = new vscode.EventEmitter<void>();

/** Fires whenever a file enters or leaves edit mode, so banners can refresh. */
export const onDidChangeEditMode = editModeEmitter.event;

export function isInEditMode(uri: vscode.Uri): boolean {
    return editModeUris.has(uri.toString());
}

function enterEditMode(uri: vscode.Uri): void {
    if (!editModeUris.has(uri.toString())) {
        editModeUris.add(uri.toString());
        editModeEmitter.fire();
    }
}

function exitEditMode(uri: vscode.Uri): void {
    if (editModeUris.delete(uri.toString())) {
        editModeEmitter.fire();
    }
}

export async function acceptReview(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    info: BotEditInfo,
    closePanels: () => void,
): Promise<void> {
    analytics.sendEvent(
        "VS Code PR Review Accept",
        "VS_CODE_PLUGIN_PR_REVIEW_ACCEPT",
    );
    await markReviewed(context, uri, info);
    exitEditMode(uri);
    closePanels();
    vscode.window.showInformationMessage(
        `Accepted bot edit ${info.shortSha}.`,
    );
}

export async function rejectReview(
    uri: vscode.Uri,
    info: BotEditInfo,
    closePanels: () => void,
): Promise<void> {
    if (!info.parentSha) {
        vscode.window.showErrorMessage(
            "Can't reject: the bot commit has no parent in this branch.",
        );
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Restore ${pathBasename(uri)} to the version before ${info.shortSha}?`,
        { modal: true },
        "Restore",
    );
    if (confirm !== "Restore") {
        return;
    }

    analytics.sendEvent(
        "VS Code PR Review Reject",
        "VS_CODE_PLUGIN_PR_REVIEW_REJECT",
    );

    const gitApi = getGitApi();
    const repo = gitApi?.getRepository(uri);
    if (!repo) {
        vscode.window.showErrorMessage(
            "Git extension not available — can't restore from history.",
        );
        return;
    }

    let parentContent: string;
    try {
        const relPath = vscode.workspace.asRelativePath(uri, false);
        parentContent = await repo.show(info.parentSha, relPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to read parent commit: ${msg}`);
        return;
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((b) => {
        const range = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
        );
        b.replace(range, parentContent);
    });
    await doc.save();

    exitEditMode(uri);
    closePanels();
    vscode.window.showInformationMessage(
        `Restored to parent of ${info.shortSha}. Commit the change to finish rejecting.`,
    );
}

/**
 * Snapshot of the bot draft (the on-disk regenerated `.mmd`) taken when the
 * user enters edit mode, so "Cancel" can restore exactly what the bot produced
 * even after the file has been saved with the user's edits.
 */
const botDraftSnapshot = new Map<string, string>();

/**
 * Slice 5 edit mode — open the bot's draft in the normal Mermaid editor and
 * enter a three-state flow surfaced by the persistent banner:
 *   - Restore original → revert to the pre-bot version ({@link rejectReview})
 *   - Cancel → discard the user's edits, keep reviewing ({@link cancelEdit})
 *   - Save → commit the user's edited version ({@link commitEdits})
 *
 * It does not fork the editor — the file is the same `.mmd`; only the banner
 * changes to make the three choices unambiguous.
 */
export async function editReview(
    uri: vscode.Uri,
    info: BotEditInfo,
    closePanels: () => void,
): Promise<void> {
    analytics.sendEvent(
        "VS Code PR Review Edit",
        "VS_CODE_PLUGIN_PR_REVIEW_EDIT",
    );
    closePanels();

    // Collapse to a single column so the .mmd editor is the only thing
    // on screen — otherwise the now-empty review column can steal focus
    // and the user types into a non-editor surface.
    await vscode.commands.executeCommand("vscode.setEditorLayout", {
        orientation: 0,
        groups: [{}],
    });

    const doc = await vscode.workspace.openTextDocument(uri);

    // Capture the bot draft before the user touches it, so Cancel restores the
    // bot's regeneration rather than whatever happens to be on disk later.
    botDraftSnapshot.set(uri.toString(), doc.getText());
    enterEditMode(uri);

    const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
    });

    // Park the cursor at the end of file so the user has an obvious
    // place to type.
    const lastLine = Math.max(0, doc.lineCount - 1);
    const lastChar = doc.lineAt(lastLine).range.end.character;
    const eof = new vscode.Position(lastLine, lastChar);
    editor.selection = new vscode.Selection(eof, eof);
    editor.revealRange(new vscode.Range(eof, eof));

    vscode.window.showInformationMessage(
        `Editing ${pathBasename(uri)} — use the banner at the top: ` +
            `Save commits your edits · Cancel discards them · Restore original reverts to before ${info.shortSha}.`,
    );
}

/**
 * Cancel edit mode: discard the user's edits and return the file to the bot
 * draft they started from, then drop back to the normal review banner. Nothing
 * is committed. The pre-bot history is untouched — that's "Restore original".
 */
export async function cancelEdit(
    uri: vscode.Uri,
    info: BotEditInfo,
): Promise<void> {
    const snapshot = botDraftSnapshot.get(uri.toString());

    const doc = await vscode.workspace.openTextDocument(uri);
    const dirty = doc.isDirty;
    const driftedFromSnapshot =
        snapshot !== undefined && snapshot !== doc.getText();

    if (dirty || driftedFromSnapshot) {
        const confirm = await vscode.window.showWarningMessage(
            `Discard your edits to ${pathBasename(uri)} and restore the synced draft (${info.shortSha})?`,
            { modal: true },
            "Discard edits",
        );
        if (confirm !== "Discard edits") {
            return;
        }
    }

    // Restore the bot draft we snapshotted on entering edit mode. If we have no
    // snapshot (e.g. edit mode survived a reload) just revert unsaved changes.
    if (snapshot !== undefined && driftedFromSnapshot) {
        const editor = await vscode.window.showTextDocument(doc, {
            preview: false,
        });
        await editor.edit((b) => {
            const range = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length),
            );
            b.replace(range, snapshot);
        });
        await doc.save();
    } else if (dirty) {
        await vscode.window.showTextDocument(doc, { preview: false });
        await vscode.commands.executeCommand("workbench.action.files.revert");
    }

    analytics.sendEvent(
        "VS Code PR Review Edit Cancelled",
        "VS_CODE_PLUGIN_PR_REVIEW_EDIT_CANCELLED",
    );
    botDraftSnapshot.delete(uri.toString());
    exitEditMode(uri);
    vscode.window.showInformationMessage(
        `Discarded edits — back to reviewing the synced draft ${info.shortSha}.`,
    );
}

/**
 * Commit the user's edits on top of a bot commit.
 *
 * Slice 2 prototype of the eventual Slice 5 "edit mode" workflow. Saves
 * the file if dirty, stages it, commits with a `Mermaid-Sync-Reviewed-By:`
 * trailer so the GitHub App and other reviewers can see the diagram was
 * human-reviewed, and offers an optional push.
 *
 * Refuses to run when there are no unstaged changes for the file —
 * "no edits to commit" is a friendlier failure than an empty commit.
 */
export async function commitEdits(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    info: BotEditInfo,
): Promise<void> {
    const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uri.toString(),
    );
    if (doc?.isDirty) {
        await doc.save();
    }

    const gitApi = getGitApi();
    const repo = gitApi?.getRepository(uri);
    if (!repo) {
        vscode.window.showErrorMessage(
            "Git extension not available — can't commit edits.",
        );
        return;
    }

    const fsPath = uri.fsPath;
    const hasFileChange =
        repo.state.workingTreeChanges.some((c) => c.uri.fsPath === fsPath) ||
        repo.state.indexChanges.some((c) => c.uri.fsPath === fsPath);
    if (!hasFileChange) {
        vscode.window.showInformationMessage(
            "No edits to commit on this diagram.",
        );
        return;
    }

    const reviewer = await resolveReviewerName(repo);
    const fileName = pathBasename(uri);
    const defaultMessage = `Adjust ${fileName} synced by Mermaid Sync · ${info.shortSha}`;
    const message = await vscode.window.showInputBox({
        prompt: "Commit message for your edits",
        value: defaultMessage,
        validateInput: (v) => (v.trim().length === 0 ? "Message can't be empty" : null),
    });
    if (!message) {
        return;
    }

    const trailer = `Mermaid-Sync-Reviewed-By: ${reviewer}`;
    const fullMessage = `${message}\n\n${trailer}`;

    try {
        await repo.add([fsPath]);
        await repo.commit(fullMessage);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Couldn't commit edits: ${msg}`);
        return;
    }

    analytics.sendEvent(
        "VS Code PR Review Commit Edits",
        "VS_CODE_PLUGIN_PR_REVIEW_COMMIT_EDITS",
    );
    await markReviewed(context, uri, info);
    botDraftSnapshot.delete(uri.toString());
    exitEditMode(uri);

    const choice = await vscode.window.showInformationMessage(
        `Committed your edits with trailer ${trailer}.`,
        "Push",
        "Not now",
    );
    if (choice === "Push") {
        try {
            await repo.push();
            vscode.window.showInformationMessage("Pushed to remote.");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Push failed: ${msg}`);
        }
    }
}

async function resolveReviewerName(repo: import("../../types/git").Repository): Promise<string> {
    // Prefer the current Git user.name from config; fall back to the
    // branch ref name; final fallback "you" so the trailer is never
    // empty.
    try {
        const config = await repo.getConfig("user.name");
        if (config && config.trim().length > 0) { return config.trim(); }
    } catch { /* ignore */ }
    return repo.state.HEAD?.name ?? "you";
}

/**
 * `workspaceState`-backed memo of `uri+sha` pairs the user has already
 * accepted. Slice 1's banner / decoration providers can consult this in a
 * future iteration to suppress the indicator post-review without waiting for
 * a new commit to land.
 */
export async function markReviewed(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    info: BotEditInfo,
): Promise<void> {
    const map = context.workspaceState.get<Record<string, string>>(
        REVIEWED_KEY,
        {},
    );
    map[uri.toString()] = info.commitSha;
    await context.workspaceState.update(REVIEWED_KEY, map);
}

export function isReviewed(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    info: BotEditInfo,
): boolean {
    const map = context.workspaceState.get<Record<string, string>>(
        REVIEWED_KEY,
        {},
    );
    return map[uri.toString()] === info.commitSha;
}

function pathBasename(uri: vscode.Uri): string {
    const segments = uri.path.split("/");
    return segments[segments.length - 1] ?? uri.toString();
}

function getGitApi(): GitAPI | undefined {
    const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
    if (!ext?.exports?.enabled) {
        return undefined;
    }
    try {
        return ext.exports.getAPI(1);
    } catch {
        return undefined;
    }
}

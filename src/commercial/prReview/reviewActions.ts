import * as vscode from "vscode";
import type { API as GitAPI, GitExtension } from "../../types/git";
import analytics from "../../analytics";
import { BotEditInfo } from "./botEditDetector";

const REVIEWED_KEY = "mermaidChart.prReview.reviewed";

/**
 * Side-effects that wire the Slice 2 Accept / Reject / Edit affordances to
 * actual workspace and git operations.
 *
 * "Reject" is the only action with destructive force — it asks for explicit
 * confirmation and writes the parent-commit blob back to the working tree.
 * Slice 5 graduates "Edit" to a full three-state edit mode; for now it just
 * focuses the editor.
 */

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

    closePanels();
    vscode.window.showInformationMessage(
        `Restored to parent of ${info.shortSha}. Commit the change to finish rejecting.`,
    );
}

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
        `Edit mode · ${pathBasename(uri)} — make your changes, then click "Commit edits" at the top of the file.`,
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

import * as vscode from "vscode";

/**
 * Information about a bot-authored edit detected on a tracked file.
 *
 * `commitSha`/`shortSha` identify the commit. `parentSha` is needed by Slice 2
 * to retrieve the pre-bot blob from git for the source-diff pane.
 *
 * The optional fields are populated from Git commit-message trailers when
 * the bot includes them; the extension never invents them. When present
 * they let the review surface link out to the originating PR and show
 * context about why the regeneration happened.
 *
 * Recognised trailers:
 *   • `Mermaid-Sync: regenerated`        (required, gates detection)
 *   • `Mermaid-Sync-Source: <ref>`       (e.g. `pr-1`, `feat/payments`) → sourceRef
 *   • `Mermaid-Sync-PR: #482`            → prRef
 *   • `Mermaid-Sync-PR-Title: feat: …`   → prTitle (plain text, not markdown)
 *   • `Mermaid-Sync-Reason: <one line>`  → reason (shown in the banner subtitle)
 */
export interface BotEditInfo {
    commitSha: string;
    shortSha: string;
    parentSha?: string;
    commitMessage: string;
    authorName: string;
    authoredAt: Date;
    sourceRef?: string;
    prRef?: string;
    prTitle?: string;
    reason?: string;
}

/**
 * Strategy interface for detecting whether a file's most recent edit was made
 * by the Mermaid Sync bot. Implementations may inspect git trailers, GitHub PR
 * labels, webhook events, or file-level metadata — consumers don't care.
 *
 * Slice 0 ships {@link GitTrailerDetector}; future slices can swap in a
 * label-based detector without touching the banner / decoration / diff
 * consumers in Slices 1 and 2.
 */
export interface BotEditDetector {
    /**
     * Returns bot-edit info for the file at `uri`, or `null` when the file is
     * not bot-edited, not tracked, the git extension is unavailable, or the
     * detector is disabled by config.
     */
    detect(uri: vscode.Uri): Promise<BotEditInfo | null>;

    /**
     * Fires when the detection result for a uri may have changed (e.g. a new
     * commit landed, the trailer config was edited, or detection was toggled).
     * Consumers re-query `detect` for the affected uri.
     */
    readonly onDidChange: vscode.Event<vscode.Uri | undefined>;
}

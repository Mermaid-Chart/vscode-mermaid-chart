import * as vscode from "vscode";
import type { API as GitAPI, GitExtension } from "../../types/git";

const SCHEME = "mermaid-bot-edit";

/**
 * Provides the contents of a tracked file *as of a specific commit* under a
 * dedicated URI scheme so VS Code's built-in `vscode.diff` editor can render
 * "before" (parent commit) vs "after" (working tree) without us building a
 * custom diff renderer.
 *
 * URI shape: `mermaid-bot-edit://<sha>/<absolute-path>?<original-uri>`
 *
 * `<original-uri>` is the encoded working-tree URI; we use it to find the
 * owning git repository because the absolute path alone may live in a
 * sub-repo of a multi-root workspace.
 */
export class BotEditContentProvider
    implements vscode.TextDocumentContentProvider, vscode.Disposable
{
    static readonly scheme = SCHEME;

    private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.emitter.event;

    dispose(): void {
        this.emitter.dispose();
    }

    /**
     * Build a virtual URI that {@link provideTextDocumentContent} can resolve.
     */
    static buildUri(originalUri: vscode.Uri, sha: string): vscode.Uri {
        return vscode.Uri.parse(
            `${SCHEME}://${sha}${originalUri.path}?${encodeURIComponent(originalUri.toString())}`,
        );
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const sha = uri.authority;
        const filePath = uri.path;
        const originalUriEncoded = uri.query;
        if (!sha || !filePath || !originalUriEncoded) {
            return "";
        }

        const originalUri = vscode.Uri.parse(decodeURIComponent(originalUriEncoded));

        const gitApi = getGitApi();
        if (!gitApi) {
            return "";
        }

        const repo = gitApi.getRepository(originalUri);
        if (!repo) {
            return "";
        }

        try {
            const relPath = vscode.workspace.asRelativePath(originalUri, false);
            return await repo.show(sha, relPath);
        } catch (err) {
            console.warn("[BotEditContentProvider] repo.show failed:", err);
            return "";
        }
    }
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

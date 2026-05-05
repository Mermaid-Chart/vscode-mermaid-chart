import * as vscode from "vscode";
import analytics from "../../analytics";
import { BotEditDetector } from "./botEditDetector";

/**
 * Tab-badge dot (•) for files the Mermaid Sync bot last edited. Uses the
 * built-in `charts.purple` ThemeColor — distinct from VS Code's git
 * decoration palette (modified-yellow, untracked-green, added-green) so the
 * indicator doesn't read as a duplicate git status.
 *
 * Also fires the `BotEdit Detected` analytics event once per `uri+sha` to
 * answer Slice 1's open question: "do users notice and care?"
 */
export class BotEditFileDecorationProvider
    implements vscode.FileDecorationProvider, vscode.Disposable
{
    private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this.emitter.event;

    private readonly disposables: vscode.Disposable[] = [];
    private readonly detectedFor = new Set<string>();

    constructor(private readonly detector: BotEditDetector) {
        this.disposables.push(this.emitter);
        this.disposables.push(
            this.detector.onDidChange((uri) => {
                this.detectedFor.clear();
                if (uri) {
                    this.emitter.fire(uri);
                } else {
                    this.refreshAllVisible();
                }
            }),
        );
    }

    dispose(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* best-effort */ }
        }
    }

    /**
     * Re-fire decorations for every Mermaid file currently open in a tab.
     * VS Code's decoration provider has no "refresh all" primitive — listing
     * the open tabs and firing per-uri is the canonical workaround.
     */
    private refreshAllVisible(): void {
        const uris: vscode.Uri[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    uris.push(tab.input.uri);
                }
            }
        }
        if (uris.length > 0) {
            this.emitter.fire(uris);
        }
    }

    async provideFileDecoration(
        uri: vscode.Uri,
    ): Promise<vscode.FileDecoration | undefined> {
        if (uri.scheme !== "file") {
            return undefined;
        }
        if (!/\.(mmd|mermaid)$/i.test(uri.fsPath)) {
            return undefined;
        }

        const info = await this.detector.detect(uri);
        if (!info) {
            return undefined;
        }

        const detectedKey = `${uri.toString()}@${info.commitSha}`;
        if (!this.detectedFor.has(detectedKey)) {
            this.detectedFor.add(detectedKey);
            try {
                analytics.sendEvent(
                    "VS Code PR Review Bot Edit Detected",
                    "VS_CODE_PLUGIN_PR_REVIEW_BOT_EDIT_DETECTED",
                );
            } catch (err) {
                console.warn("[BotEditFileDecorationProvider] analytics failed:", err);
            }
        }

        return {
            badge: "•",
            tooltip: `Synced by Mermaid Sync · ${info.shortSha}`,
            color: new vscode.ThemeColor("charts.purple"),
            propagate: false,
        };
    }
}

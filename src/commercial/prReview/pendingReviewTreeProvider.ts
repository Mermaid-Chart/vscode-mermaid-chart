import * as vscode from "vscode";
import { BotEditDetector, BotEditInfo } from "./botEditDetector";
import { OPEN_REVIEW_COMMAND } from "./botEditCodeLensProvider";
import { showUpsellModal } from "./proFeatureUpsell";

/**
 * Activity-bar tree view that surfaces the PR Review state for the
 * workspace. Slice 2 ships a 1:1 prototype:
 *
 *   • Live "Pending review" rows for every .mmd file in the workspace
 *     where the detector finds a bot commit on top. Click → opens the
 *     review surface.
 *   • Two locked stub rows ("Multi-diagram review", "Bulk accept") that
 *     advertise the Slice 3 / Pro-tier features. Click → upsell modal.
 *
 * The first set is dynamic and refreshes on `detector.onDidChange`. The
 * locked rows are static — they're the carrot, not a working feature.
 *
 * When there are no bot-edited diagrams in the workspace, we render a
 * single "No pending diagrams" placeholder so the panel never looks
 * broken. The locked rows remain underneath either way.
 */

interface DetectedDiagram {
    uri: vscode.Uri;
    info: BotEditInfo;
}

/**
 * Marker class so `getTreeItem`/`getChildren` can dispatch by type
 * without sprawling instance-of chains.
 */
class PendingReviewItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly kind: "diagram" | "empty" | "locked",
        public readonly featureId?: string,
        public readonly diagramUri?: vscode.Uri,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
}

export class PendingReviewTreeProvider
    implements vscode.TreeDataProvider<PendingReviewItem>, vscode.Disposable
{
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly detector: BotEditDetector) {
        this.disposables.push(this.emitter);
        this.disposables.push(
            this.detector.onDidChange(() => this.emitter.fire()),
        );
    }

    dispose(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* best-effort */ }
        }
    }

    getTreeItem(element: PendingReviewItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PendingReviewItem): Promise<PendingReviewItem[]> {
        if (element) {
            return [];
        }

        const detected = await this.findPendingDiagrams();
        const items: PendingReviewItem[] = [];

        if (detected.length === 0) {
            const empty = new PendingReviewItem(
                "No pending diagrams",
                "empty",
            );
            empty.description = "No bot edits detected in this workspace";
            empty.iconPath = new vscode.ThemeIcon("check");
            items.push(empty);
        } else {
            for (const d of detected) {
                const fileName = d.uri.path.split("/").pop() ?? d.uri.fsPath;
                const item = new PendingReviewItem(
                    fileName,
                    "diagram",
                    undefined,
                    d.uri,
                );
                item.description = d.info.shortSha;
                item.tooltip = `Synced by Mermaid Sync · ${d.info.shortSha} — click to review`;
                item.iconPath = new vscode.ThemeIcon("sync");
                item.contextValue = "mermaidSync.pendingDiagram";
                item.command = {
                    command: OPEN_REVIEW_COMMAND,
                    title: "Open review",
                    arguments: [d.uri],
                };
                items.push(item);
            }
        }

        // The two locked rows are always present so the upsell story is
        // legible even when the workspace has zero pending diagrams.
        const multi = new PendingReviewItem(
            "Multi-diagram review",
            "locked",
            "multiDiagram",
        );
        multi.description = "PRO";
        multi.tooltip = "Review every diagram a PR touches in one place — available on Pro plan";
        multi.iconPath = new vscode.ThemeIcon("lock");
        multi.command = {
            command: "mermaidChart.prReview.showUpsell",
            title: "Show upsell",
            arguments: ["multiDiagram"],
        };
        items.push(multi);

        const bulk = new PendingReviewItem(
            "Bulk accept",
            "locked",
            "multiDiagram",
        );
        bulk.description = "PRO";
        bulk.tooltip = "Accept every diagram in a PR at once — available on Pro plan";
        bulk.iconPath = new vscode.ThemeIcon("lock");
        bulk.command = {
            command: "mermaidChart.prReview.showUpsell",
            title: "Show upsell",
            arguments: ["multiDiagram"],
        };
        items.push(bulk);

        return items;
    }

    /**
     * Scan the workspace for tracked .mmd files and ask the detector
     * about each. The detector itself caches by uri+sha so repeated
     * calls are cheap; we cap the search to a sane upper bound to keep
     * the panel responsive in larger repos.
     */
    private async findPendingDiagrams(): Promise<DetectedDiagram[]> {
        const uris = await vscode.workspace.findFiles(
            "**/*.{mmd,mermaid}",
            "**/node_modules/**",
            50,
        );
        const detected: DetectedDiagram[] = [];
        for (const uri of uris) {
            try {
                const info = await this.detector.detect(uri);
                if (info) {
                    detected.push({ uri, info });
                }
            } catch {
                // Skip any file the detector can't read.
            }
        }
        return detected;
    }
}

export const SHOW_UPSELL_COMMAND = "mermaidChart.prReview.showUpsell";

export function registerPendingReviewCommands(): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand(SHOW_UPSELL_COMMAND, (featureId: string) => {
            void showUpsellModal(featureId);
        }),
    ];
}

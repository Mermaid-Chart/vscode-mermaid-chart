import * as vscode from "vscode";
import { BotEditDetector } from "./botEditDetector";
import { MermaidChartAuthenticationProvider } from "../../mermaidChartAuthenticationProvider";
import { OPEN_REVIEW_COMMAND } from "./botEditCodeLensProvider";
import { markReviewed } from "./reviewActions";
import {
    DiagramReviewItem,
    formatCompactCounts,
    getBotEditedDiagrams,
} from "./getBotEditedDiagrams";

/**
 * Slice 3 — the dedicated **Review Mermaid Sync** activity-bar view.
 *
 * One entry point for a whole PR's worth of bot-regenerated diagrams:
 * instead of hunting highlighted files in the Explorer one by one, the dev
 * gets a single list of every `.mmd` the Sync bot touched on the current
 * branch, each row carrying per-file diff stats and a reviewed/unreviewed
 * marker.
 *
 * **Login gating (login, not paid).** Reviewing one diagram is always free
 * and works logged out — that path lives on the CodeLens banner + the
 * per-file review surface and is never gated here. The *aggregated list*
 * and *Accept all* are the login-gated extras. When logged out, the view
 * swaps its body for a single sign-in CTA (same view, two states) rather
 * than hiding itself; signing in unlocks the list in place.
 *
 * Detection is isolated behind {@link getBotEditedDiagrams} so swapping the
 * working-tree scan for a commit-range walk later is a one-file change.
 */

type RowKind = "signIn" | "diagram" | "empty";

class ReviewRow extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly kind: RowKind,
        public readonly item?: DiagramReviewItem,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
}

export class PendingReviewTreeProvider
    implements vscode.TreeDataProvider<ReviewRow>, vscode.Disposable
{
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    private readonly disposables: vscode.Disposable[] = [];

    /** Cached result of the last `getChildren` pass, used by Accept all. */
    private lastItems: DiagramReviewItem[] = [];

    private signedIn: boolean;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly detector: BotEditDetector,
        initialSignedIn: boolean,
    ) {
        this.signedIn = initialSignedIn;
        this.disposables.push(this.emitter);
        this.disposables.push(
            this.detector.onDidChange(() => this.refresh()),
        );
    }

    dispose(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* best-effort */ }
        }
    }

    /** Re-render the tree (e.g. after a git change or a manual refresh). */
    refresh(): void {
        this.emitter.fire();
    }

    /**
     * Update sign-in state and re-render in place. Called from the auth
     * session listener so the list unlocks without a reload.
     */
    setSignedIn(signedIn: boolean): void {
        if (this.signedIn === signedIn) {
            return;
        }
        this.signedIn = signedIn;
        this.refresh();
    }

    getTreeItem(element: ReviewRow): vscode.TreeItem {
        return element;
    }

    /**
     * Refresh {@link signedIn} from the actual auth session (silent — never
     * prompts). Updates the field only; callers decide when to re-render so we
     * never recurse from inside `getChildren`.
     */
    private async syncSignedInFromSession(): Promise<void> {
        try {
            const session = await vscode.authentication.getSession(
                MermaidChartAuthenticationProvider.id,
                [],
                { silent: true },
            );
            this.signedIn = Boolean(session);
        } catch {
            // The auth provider is registered later (inside the awaited
            // mcAPI.initialize()), so an early render can race it. Keep the
            // state we already have instead of failing the whole render.
        }
    }

    async getChildren(element?: ReviewRow): Promise<ReviewRow[]> {
        if (element) {
            return [];
        }
        // Never let a render fault leave the view silently blank — surface it as
        // a row so the failure is visible (and logged) instead of mysterious.
        try {
            const rows = await this.buildRows();
            console.log("[ReviewMermaidSync] getChildren ->", rows.length, "rows; signedIn =", this.signedIn);
            return rows;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[ReviewMermaidSync] getChildren failed:", err);
            const errorRow = new ReviewRow(`Couldn't load: ${msg}`, "empty");
            errorRow.iconPath = new vscode.ThemeIcon("error");
            return [errorRow];
        }
    }

    private async buildRows(): Promise<ReviewRow[]> {
        // Reconcile against the real auth session before rendering. The flag we
        // were seeded with (`isUserLoggedIn`) can drift because
        // onDidChangeSessions does not fire at startup — without this the view
        // can strand on the sign-in CTA even though a valid session exists.
        await this.syncSignedInFromSession();

        // Logged-out: swap the list body for a single sign-in CTA. The view
        // stays visible — the carrot is on screen, just locked.
        if (!this.signedIn) {
            this.lastItems = [];
            await this.setAcceptAllContext(false);
            const signIn = new ReviewRow(
                "Sign in to review synced diagrams",
                "signIn",
            );
            signIn.description = "Mermaid Chart";
            signIn.tooltip =
                "Reviewing a single diagram is free. Sign in to see every diagram a PR touched in one place.";
            signIn.iconPath = new vscode.ThemeIcon("sign-in");
            signIn.command = {
                command: SIGN_IN_COMMAND,
                title: "Sign in",
            };
            return [signIn];
        }

        const items = await getBotEditedDiagrams(this.detector, this.context);
        this.lastItems = items;
        // Accept all only makes sense for a real batch — a single-diagram PR
        // behaves exactly like Slice 2, no bulk affordance noise.
        await this.setAcceptAllContext(items.length >= 2);

        if (items.length === 0) {
            const empty = new ReviewRow("No diagrams to review", "empty");
            empty.description = "No bot edits on this branch";
            empty.iconPath = new vscode.ThemeIcon("check");
            return [empty];
        }

        return items.map((item) => this.toDiagramRow(item));
    }

    /**
     * Accept all — mark every listed diagram reviewed in one batch. Reject
     * stays per-diagram by design, so there is deliberately no counterpart.
     */
    async acceptAll(): Promise<void> {
        if (!this.signedIn) {
            return;
        }
        const items = this.lastItems.filter((i) => !i.reviewed);
        if (items.length === 0) {
            vscode.window.showInformationMessage(
                "All synced diagrams are already reviewed.",
            );
            return;
        }
        for (const item of items) {
            await markReviewed(this.context, item.uri, item.info);
        }
        this.refresh();
        const n = items.length;
        vscode.window.showInformationMessage(
            `Marked ${n} diagram${n === 1 ? "" : "s"} reviewed.`,
        );
    }

    private toDiagramRow(item: DiagramReviewItem): ReviewRow {
        const row = new ReviewRow(item.fileName, "diagram", item);

        const stats = item.counts ? formatCompactCounts(item.counts) : item.info.shortSha;
        const dir = relativeDir(item.relativePath);
        row.description = dir ? `${stats} · ${dir}` : stats;

        // Reviewed rows get a check; unreviewed get a filled dot — the
        // affordance is driven entirely by the shared workspaceState flag.
        row.iconPath = item.reviewed
            ? new vscode.ThemeIcon("check")
            : new vscode.ThemeIcon("circle-filled");

        const statusLine = item.reviewed ? "Reviewed" : "Not yet reviewed";
        const countsLine = item.counts
            ? `Changes: ${formatCompactCounts(item.counts)}`
            : "Node-level changes unavailable";
        row.tooltip = `${item.relativePath}\nSynced by Mermaid Sync · ${item.info.shortSha}\n${countsLine}\n${statusLine} — click to review`;

        row.contextValue = "mermaidSync.pendingDiagram";
        row.command = {
            command: OPEN_REVIEW_COMMAND,
            title: "Open review",
            arguments: [item.uri],
        };
        return row;
    }

    private async setAcceptAllContext(canAcceptAll: boolean): Promise<void> {
        await vscode.commands.executeCommand(
            "setContext",
            "mermaidChart.prReview.canAcceptAll",
            canAcceptAll,
        );
    }
}

/** Parent directory of a relative path, or "" when the file is at the root. */
function relativeDir(relativePath: string): string {
    const idx = relativePath.lastIndexOf("/");
    return idx === -1 ? "" : relativePath.slice(0, idx);
}

export const ACCEPT_ALL_COMMAND = "mermaidChart.prReview.acceptAll";
export const SIGN_IN_COMMAND = "mermaidChart.prReview.signIn";

export function registerPendingReviewCommands(
    provider: PendingReviewTreeProvider,
): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand(ACCEPT_ALL_COMMAND, () => {
            void provider.acceptAll();
        }),
        vscode.commands.registerCommand(SIGN_IN_COMMAND, async () => {
            await vscode.commands.executeCommand("mermaidChart.login");
            // `mermaidChart.login` calls getSession({ createIfNone: true }).
            // When a session already exists it returns silently WITHOUT firing
            // onDidChangeSessions, so the view never learns it is signed in and
            // the CTA looks dead. Reconcile against the real session so the list
            // unlocks whether this was a fresh OAuth login or an existing one.
            const session = await vscode.authentication.getSession(
                MermaidChartAuthenticationProvider.id,
                [],
                { silent: true },
            );
            provider.setSignedIn(Boolean(session));
        }),
    ];
}

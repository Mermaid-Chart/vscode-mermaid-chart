import * as vscode from "vscode";
import analytics from "../../analytics";

/**
 * Demo-time upsell modals for the five paid Mermaid Sync features.
 *
 * The plugin and the review experience are free forever; these features
 * are the carrots — visible in-product so the buyer (and the reviewer)
 * can see what they're paying for. None of them are functional today;
 * clicking a locked pill or tree node lands here and shows a
 * feature-specific information modal.
 *
 * Every click also sends an analytics event so when this ships the
 * surface doubles as funnel instrumentation: which paid feature is
 * generating the most click-through interest.
 */

export type FeatureId = "library" | "comments" | "audit" | "aiEdit" | "multiDiagram";

type PrimaryAction = "signin" | "trial" | "waitlist";

interface FeatureCopy {
    title: string;
    body: string;
    primaryAction: PrimaryAction;
}

const FEATURE_COPY: Record<FeatureId, FeatureCopy> = {
    library: {
        title: "Engineering Docs library",
        body:
            "Add this diagram to your team's shared Mermaid Chart library so reviewers, designers, and PMs always see the latest version — without anyone having to clone the repo.",
        primaryAction: "signin",
    },
    comments: {
        title: "Comments thread",
        body:
            "Discuss diagram changes with your team — comments are scoped to the .mmd file and persist across review cycles, so you don't lose context between PRs.",
        primaryAction: "trial",
    },
    audit: {
        title: "Logged review history",
        body:
            "Every Accept / Reject / Edit on a Mermaid Sync PR is recorded with reviewer name and timestamp — required for audited compliance workflows in regulated orgs.",
        primaryAction: "trial",
    },
    aiEdit: {
        title: "AI-assisted edit",
        body:
            "When you click Edit on a bot's draft, get AI suggestions for fixes and refinements — trained on your team's diagram conventions.",
        primaryAction: "waitlist",
    },
    multiDiagram: {
        title: "Multi-diagram review",
        body:
            "When a PR touches more than one diagram, see them all in one place with bulk-accept, per-diagram comments, and a single audit trail.",
        primaryAction: "trial",
    },
};

const PRICING_URL = "https://www.mermaidchart.com/app/plans";

/**
 * Show the upsell modal for a paid feature. Buttons resolve from the
 * feature's `primaryAction`:
 *   - signin   → "Sign in" runs the existing `mermaidChart.login` command.
 *   - trial    → "Start trial" opens the pricing page in a browser.
 *   - waitlist → "Join waitlist" opens the pricing page in a browser.
 *
 * "Learn more" always opens the pricing page; "Not now" is a no-op.
 * The modal is non-blocking — VS Code resolves the promise once the
 * user picks a button or dismisses.
 */
export async function showUpsellModal(featureId: string): Promise<void> {
    const copy = FEATURE_COPY[featureId as FeatureId];
    if (!copy) {
        return;
    }

    try {
        analytics.sendEvent(
            `VS Code PR Review Upsell ${copy.title}`,
            `VS_CODE_PLUGIN_PR_REVIEW_UPSELL_${featureId.toUpperCase()}`,
        );
    } catch {
        // Best-effort; analytics failures shouldn't block the modal.
    }

    const primaryLabel =
        copy.primaryAction === "signin" ? "Sign in"
        : copy.primaryAction === "trial" ? "Start trial"
        : "Join waitlist";

    const choice = await vscode.window.showInformationMessage(
        `${copy.title} — ${copy.body}`,
        { modal: false },
        primaryLabel,
        "Learn more",
        "Not now",
    );

    if (choice === primaryLabel) {
        if (copy.primaryAction === "signin") {
            void vscode.commands.executeCommand("mermaidChart.login");
        } else {
            void vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
        }
    } else if (choice === "Learn more") {
        void vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
    }
}

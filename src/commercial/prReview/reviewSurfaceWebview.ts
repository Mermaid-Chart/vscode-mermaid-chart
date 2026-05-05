import * as vscode from "vscode";
import { BotEditInfo } from "./botEditDetector";
import { computeLineDiff, LineDiffEntry } from "./lineDiff";
import {
    ACCEPT_COMMAND,
    EDIT_COMMAND,
    REJECT_COMMAND,
} from "./openReview";

/**
 * Slice 2 review surface — replaces the prior 3-pane setup
 * (vscode.diff editor + two stacked Mermaid previews) with a single
 * webview containing:
 *
 *   • A tinted banner ("Synced by Mermaid Sync · <sha>") with timestamp
 *     and author — the canonical phrase, never "AUTO-REGENERATED"; per
 *     taste review, names the agent without AI-tooling filler.
 *   • A single source-diff column (custom render of `lineDiff`).
 *   • A flat footer with Edit / Reject / Accept — equal weight on
 *     purpose. In a review surface, button hierarchy is a values
 *     statement; a green-primary "Accept" telegraphs the right answer
 *     and biases the user away from actually reviewing.
 *
 * The single-pane visual preview that completes the mockup is opened
 * beside this panel by `openReview` — re-using the existing Mermaid
 * webview infrastructure so this module stays renderer-free.
 */
export interface ReviewSurfaceOptions {
    /**
     * Whether the user is currently signed in to Mermaid Chart. When true,
     * the surface shows the "logged-in extras" block (library badge,
     * comment thread placeholder, audit log line). When false, the same
     * block is rendered as a single sign-in CTA — visible *carrot*, not
     * locked feature.
     */
    isSignedIn: boolean;
    /**
     * Optional callback for the "Sign in" affordance in the extras block.
     * The host extension wires this to its existing auth flow.
     */
    onSignInRequest?: () => void;
    /**
     * Optional callback for clicks on a locked paid-feature pill. The
     * host opens a feature-specific upsell modal (see
     * `proFeatureUpsell.ts`). `featureId` is one of the keys in
     * FEATURE_COPY there — typed as a string to keep this module
     * decoupled from the modal copy.
     */
    onLockedFeatureClicked?: (featureId: string) => void;
}

export function openReviewSurfaceWebview(
    info: BotEditInfo,
    fileName: string,
    oldContent: string,
    newContent: string,
    onAction: (action: "accept" | "reject" | "edit") => void,
    options: ReviewSurfaceOptions = { isSignedIn: false },
): vscode.WebviewPanel {
    // Pin to column 1 (and force focus there) so the surface is always the
    // foreground tab — `ViewColumn.Active` sometimes left the original .mmd
    // tab on top, so users had to click the surface tab to see it.
    const panel = vscode.window.createWebviewPanel(
        "mermaidPrReviewSurface",
        `${fileName} · Synced by Mermaid Sync`,
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true },
    );

    const diff = computeLineDiff(oldContent, newContent);
    const nonce = makeNonce();

    panel.webview.html = renderHtml(
        panel.webview,
        nonce,
        info,
        fileName,
        diff.entries,
        diff.addedCount,
        diff.removedCount,
        options,
    );

    panel.webview.onDidReceiveMessage((message: { type?: string; featureId?: string }) => {
        if (!message?.type) { return; }
        if (message.type === "accept") { onAction("accept"); }
        else if (message.type === "reject") { onAction("reject"); }
        else if (message.type === "edit") { onAction("edit"); }
        else if (message.type === "signIn") { options.onSignInRequest?.(); }
        else if (message.type === "lockedFeatureClicked" && message.featureId) {
            options.onLockedFeatureClicked?.(message.featureId);
        }
    });

    return panel;
}

function renderHtml(
    webview: vscode.Webview,
    nonce: string,
    info: BotEditInfo,
    fileName: string,
    entries: LineDiffEntry[],
    addedCount: number,
    removedCount: number,
    options: ReviewSurfaceOptions,
): string {
    const csp = [
        "default-src 'none'",
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`,
        `img-src ${webview.cspSource} data:`,
        `font-src ${webview.cspSource}`,
    ].join("; ");

    const subtitle = formatSubtitle(info);
    const diffRows = entries
        .map((e) => renderRow(e))
        .join("");
    const reasonLine = info.reason
        ? `<p class="reason">${escapeHtml(info.reason)}</p>`
        : "";
    const prLine = renderPrLine(info);
    const extrasBlock = renderExtrasBlock(options);

    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  :root {
    color-scheme: light dark;
  }
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background: var(--vscode-editor-background);
  }
  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  /* Header — tinted banner. Subtle, not a marketing surface. */
  header.banner {
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 14px 18px 12px;
    background: color-mix(in srgb, var(--vscode-charts-purple) 12%, transparent);
  }
  header.banner .title-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  header.banner .title {
    font-weight: 600;
    font-size: 13px;
  }
  header.banner .sha {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--vscode-textBlockQuote-background);
    color: var(--vscode-foreground);
  }
  header.banner .meta {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  header.banner .filename {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  header.banner .reason {
    margin: 6px 0 0;
    color: var(--vscode-foreground);
    font-size: 12.5px;
    line-height: 1.45;
  }
  header.banner .pr-link {
    margin-top: 6px;
    font-size: 12px;
  }
  header.banner .pr-link a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  header.banner .pr-link a:hover {
    text-decoration: underline;
  }

  /* Logged-in extras — sits between banner and diff. Shown either as
     active state (signed in) or as a flat sign-in CTA (signed out).
     Same visual real estate either way: the carrot is *visible* even
     when locked, so the user knows what they're missing. */
  section.extras {
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 10px 18px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-editor-background);
  }
  section.extras .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--vscode-panel-border);
    background: transparent;
    cursor: default;
    user-select: none;
  }
  section.extras .badge.active {
    color: var(--vscode-foreground);
  }
  /* Locked variants share an opacity floor and a pointer cursor so the
     "click for upsell" affordance is consistent. */
  section.extras .badge.locked-signin,
  section.extras .badge.locked-team,
  section.extras .badge.locked-pro {
    cursor: pointer;
    opacity: 0.78;
  }
  section.extras .badge.locked-signin:hover,
  section.extras .badge.locked-team:hover,
  section.extras .badge.locked-pro:hover {
    opacity: 1;
    border-color: var(--vscode-focusBorder);
  }
  section.extras .badge .lock {
    display: inline-flex;
    width: 10px;
    height: 10px;
    color: var(--vscode-descriptionForeground);
  }
  section.extras .badge .lock svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
  /* Tiny tier label inside locked pills — TEAM / PRO. Uppercase + tight
     letter-spacing reads as a label, not a button. Color is a soft tint
     of the theme accent so it stays subtle. */
  section.extras .badge .tier {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 2px;
    color: color-mix(in srgb, var(--vscode-charts-purple) 70%, var(--vscode-foreground));
    background: color-mix(in srgb, var(--vscode-charts-purple) 14%, transparent);
  }
  section.extras .signin {
    flex: 1 1 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  section.extras .signin button {
    appearance: none;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    padding: 4px 12px;
    border-radius: 3px;
    font: inherit;
    cursor: pointer;
  }
  section.extras .signin button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  /* Body */
  main {
    flex: 1 1 auto;
    overflow: auto;
    padding: 12px 18px;
  }
  .diff-card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .diff-card > header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .diff-counts .added {
    color: var(--vscode-gitDecoration-addedResourceForeground);
    margin-right: 8px;
  }
  .diff-counts .removed {
    color: var(--vscode-gitDecoration-deletedResourceForeground);
  }

  .diff-body {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    line-height: 1.55;
  }
  .diff-row {
    display: grid;
    grid-template-columns: 44px 44px 16px 1fr;
    column-gap: 0;
  }
  .diff-row .gutter {
    text-align: right;
    padding: 0 8px;
    color: var(--vscode-editorLineNumber-foreground);
    user-select: none;
    font-variant-numeric: tabular-nums;
  }
  .diff-row .marker {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    user-select: none;
  }
  .diff-row .text {
    padding-right: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .diff-row.add {
    background: var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.18));
  }
  .diff-row.add .marker,
  .diff-row.add .text {
    color: var(--vscode-gitDecoration-addedResourceForeground);
  }
  .diff-row.remove {
    background: var(--vscode-diffEditor-removedLineBackground, rgba(255, 0, 0, 0.12));
  }
  .diff-row.remove .marker,
  .diff-row.remove .text {
    color: var(--vscode-gitDecoration-deletedResourceForeground);
  }

  /* Footer — Slice 2.5 Path B. Hierarchy is delivered through *typography
     and color*, not fill. Accept gets a green-tinted text + border;
     Reject gets red. Edit stays neutral. Each button carries an inline
     keyboard chip (kbd element) so the affordance is visible without a
     menu. Same idiom Cursor uses for Keep/Undo. */
  footer.actions {
    border-top: 1px solid var(--vscode-panel-border);
    padding: 10px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: var(--vscode-editor-background);
  }
  footer.actions .hint {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  footer.actions .group {
    display: flex;
    gap: 8px;
  }
  footer.actions button {
    appearance: none;
    border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    padding: 5px 10px;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  footer.actions button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  footer.actions button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }
  footer.actions button kbd {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    font: inherit;
    font-size: 11px;
    line-height: 16px;
    min-width: 16px;
    text-align: center;
    background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
  }
  footer.actions button.accept {
    color: var(--vscode-charts-green, #3fb950);
    border-color: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 55%, var(--vscode-button-border, transparent));
    font-weight: 600;
  }
  footer.actions button.accept:hover {
    background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 14%, transparent);
  }
  footer.actions button.accept kbd {
    background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 22%, transparent);
    color: var(--vscode-charts-green, #3fb950);
  }
  footer.actions button.reject {
    color: var(--vscode-errorForeground, #f85149);
    border-color: color-mix(in srgb, var(--vscode-errorForeground, #f85149) 45%, var(--vscode-button-border, transparent));
  }
  footer.actions button.reject:hover {
    background: color-mix(in srgb, var(--vscode-errorForeground, #f85149) 12%, transparent);
  }
  footer.actions button.reject kbd {
    background: color-mix(in srgb, var(--vscode-errorForeground, #f85149) 18%, transparent);
    color: var(--vscode-errorForeground, #f85149);
  }
</style>
</head>
<body>
  <header class="banner">
    <div class="title-row">
      <span class="title">⟳ Synced by Mermaid Sync</span>
      <span class="sha">${escapeHtml(info.shortSha)}</span>
      <span class="meta">${escapeHtml(subtitle)}</span>
    </div>
    <div class="filename">${escapeHtml(fileName)}</div>
    ${reasonLine}
    ${prLine}
  </header>
  ${extrasBlock}
  <main>
    <section class="diff-card" aria-label="Source diff">
      <header>
        <span>Source diff</span>
        <span class="diff-counts">
          <span class="added">+${addedCount}</span><span class="removed">−${removedCount}</span>
        </span>
      </header>
      <div class="diff-body" role="table">
        ${diffRows}
      </div>
    </section>
  </main>
  <footer class="actions">
    <span class="hint">Review the change before merging.</span>
    <div class="group">
      <button class="edit" data-action="edit" type="button" title="Edit the bot's draft (⌘E)">
        Edit <kbd>⌘E</kbd>
      </button>
      <button class="reject" data-action="reject" type="button" title="Reject the bot edit (Esc)">
        Reject <kbd>Esc</kbd>
      </button>
      <button class="accept" data-action="accept" type="button" title="Accept the bot edit (⌘⏎)">
        Accept <kbd>⌘⏎</kbd>
      </button>
    </div>
  </footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("footer.actions button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (action) { vscode.postMessage({ type: action }); }
      });
    });
    const signInBtn = document.querySelector("[data-action=signIn]");
    if (signInBtn) {
      signInBtn.addEventListener("click", () => vscode.postMessage({ type: "signIn" }));
    }
    document.querySelectorAll("[data-locked]").forEach((el) => {
      const featureId = el.getAttribute("data-locked");
      if (!featureId) { return; }
      const fire = () => vscode.postMessage({ type: "lockedFeatureClicked", featureId });
      el.addEventListener("click", fire);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
      });
    });
    // Keyboard shortcuts mirror the chips inside the buttons. Captured
    // at the document level so they fire regardless of focus inside the
    // webview. We do not steal Cmd+E if the user is mid-typing in an
    // editable field.
    document.addEventListener("keydown", (e) => {
      const target = e.target;
      const inEditable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inEditable) { return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        vscode.postMessage({ type: "accept" });
      } else if (e.key === "Escape") {
        e.preventDefault();
        vscode.postMessage({ type: "reject" });
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        vscode.postMessage({ type: "edit" });
      }
    });
  </script>
</body>
</html>`;
}

function renderRow(e: LineDiffEntry): string {
    const oldNum = e.oldLine ?? "";
    const newNum = e.newLine ?? "";
    const marker = e.op === "add" ? "+" : e.op === "remove" ? "−" : " ";
    return `<div class="diff-row ${e.op}">
        <span class="gutter">${oldNum}</span>
        <span class="gutter">${newNum}</span>
        <span class="marker">${marker}</span>
        <span class="text">${escapeHtml(e.text)}</span>
    </div>`;
}

function renderPrLine(info: BotEditInfo): string {
    const ref = info.prRef?.trim();
    if (!ref) { return ""; }
    const cleaned = ref.replace(/^#/, "");
    const looksNumeric = /^\d+$/.test(cleaned);
    const label = looksNumeric ? `PR #${cleaned}` : ref;
    const linkContent = info.prTitle
        ? `${escapeHtml(label)} — ${escapeHtml(info.prTitle)}`
        : escapeHtml(label);
    // We don't synthesise a URL — the bot doesn't ship one in the trailer
    // contract today. When it does (Mermaid-Sync-PR-URL trailer), wire
    // that here. For now the line is intentionally non-clickable so we
    // don't fabricate links the host repo can't honour.
    return `<div class="pr-link" data-pr-ref="${escapeHtml(ref)}">↗ ${linkContent}</div>`;
}

/**
 * Logged-in extras sit between banner and diff. Rendered in two states:
 *
 *   • signed-in → three placeholder badges (library / comments / audit)
 *     so the prototype communicates "what you get for being signed in".
 *     This is the *carrot* the monetization model leans on. Each badge
 *     is clickable in production; in this prototype they're static.
 *
 *   • signed-out → a single CTA row in the same vertical real estate.
 *     The carrot is visible even when locked: the user can see the
 *     features they're missing, framed as upside, not paywall.
 */
/**
 * The four in-surface paid extras, always rendered — same vertical real
 * estate, same pill row, regardless of plan tier. Each pill carries its
 * own state class so the upsell story is legible at a glance:
 *
 *   • locked-signin: Library — free, but needs a Mermaid Chart account.
 *     Becomes `active` (no badge, no lock) once signed in.
 *   • locked-team:   Comments + Audit — Team-plan extras. Visible to
 *     everyone so the buyer can see what they're paying for.
 *   • locked-pro:    AI edit — Pro/AI-tier feature; always locked in
 *     this prototype. The waitlist CTA in the modal sets expectations
 *     without overpromising.
 *
 * Click on a locked pill posts `lockedFeatureClicked` with the featureId
 * — the host opens a feature-specific upsell modal (proFeatureUpsell.ts).
 * Plain-text labels, no emoji: matches taste-review on the footer.
 */
function renderExtrasBlock(options: ReviewSurfaceOptions): string {
    const lockSvg = `<span class="lock" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 1.5a3 3 0 0 0-3 3V6H4.5A1.5 1.5 0 0 0 3 7.5v6A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 11.5 6H11V4.5a3 3 0 0 0-3-3Zm-2 4.5V4.5a2 2 0 1 1 4 0V6Z"/></svg></span>`;

    const libraryActive = options.isSignedIn;
    const libraryClass = libraryActive ? "badge active" : "badge locked-signin";
    const libraryTitle = libraryActive
        ? "This diagram is in your team library"
        : "Sign in to add this diagram to your team library";
    const libraryInner = libraryActive
        ? `Engineering Docs library`
        : `${lockSvg}Engineering Docs library`;
    const libraryAttrs = libraryActive
        ? `class="${libraryClass}" title="${libraryTitle}"`
        : `class="${libraryClass}" title="${libraryTitle}" data-locked="library" role="button" tabindex="0"`;

    return `<section class="extras" aria-label="Workspace extras">
        <span ${libraryAttrs}>${libraryInner}</span>
        <span class="badge locked-team" title="Comments thread — available on Team plan" data-locked="comments" role="button" tabindex="0">
            ${lockSvg}Comments<span class="tier">TEAM</span>
        </span>
        <span class="badge locked-team" title="Logged review history — available on Team plan" data-locked="audit" role="button" tabindex="0">
            ${lockSvg}Logged review history<span class="tier">TEAM</span>
        </span>
        <span class="badge locked-pro" title="AI-assisted edit — coming soon on Pro plan" data-locked="aiEdit" role="button" tabindex="0">
            ${lockSvg}AI edit<span class="tier">PRO</span>
        </span>
    </section>`;
}

function formatSubtitle(info: BotEditInfo): string {
    const when = formatRelativeTime(info.authoredAt);
    const who = info.authorName?.trim() || "Mermaid Sync";
    return `· ${when} · by ${who}`;
}

function formatRelativeTime(date: Date): string {
    const ms = Date.now() - date.getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) { return "just now"; }
    const min = Math.floor(sec / 60);
    if (min < 60) { return `${min} min${min === 1 ? "" : "s"} ago`; }
    const hr = Math.floor(min / 60);
    if (hr < 24) { return `${hr} hour${hr === 1 ? "" : "s"} ago`; }
    const days = Math.floor(hr / 24);
    if (days < 7) { return `${days} day${days === 1 ? "" : "s"} ago`; }
    return date.toLocaleDateString();
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function makeNonce(): string {
    let n = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        n += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return n;
}

// Re-export to keep call sites tidy / make the command set discoverable
// from this module without importing openReview directly.
export const REVIEW_COMMANDS = {
    accept: ACCEPT_COMMAND,
    reject: REJECT_COMMAND,
    edit: EDIT_COMMAND,
};

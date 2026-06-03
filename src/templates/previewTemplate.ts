import * as vscode from "vscode";
import * as path from "path";
import {
    DiagramChangeItem,
    DiagramDiffCounts,
} from "../commercial/prReview/diagramNodeDiff";
import {
    renderChangesList,
    renderHeaderActionButtons,
    renderMetaChips,
    renderNowBeforeToggle,
    renderSummaryChips,
    renderThemeSelect,
    reviewChromeScript,
    reviewChromeStyles,
} from "../commercial/prReview/reviewChrome";

export interface PrReviewPreviewContext {
    counts: DiagramDiffCounts;
    changes: DiagramChangeItem[];
    addedNodeIds: string[];
    modifiedNodeIds: string[];
  prRef?: string;
  themeLabel?: string;
  /** Mermaid theme key passed to the webview renderer. */
  currentTheme?: string;
  fileName?: string;
  removedNodeIds?: string[];
    /** Encoded diagram text for the before state — swapped in via postMessage. */
    beforeDiagramText?: string;
}

export function getWebviewHTML(
  panel: vscode.WebviewPanel,
  extensionPath: string,
  initialContent: string,
  currentTheme: string,
  validateOnly: boolean,
  options?: {
    maxZoom?: number;
    maxCharLength?: number;
    maxEdges?: number;
  },
  highlightAddedNodeIds?: string[],
  prReview?: PrReviewPreviewContext,
): string {
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "out", "svelte", "bundle.js"))
  );
  const fontUrl = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "media", "recursive-latin-full-normal.woff2"))
  );

  panel.onDidDispose(() => {
    // Optional cleanup code here
  });

  const addedIds = prReview?.addedNodeIds ?? highlightAddedNodeIds ?? [];
  const modifiedIds = prReview?.modifiedNodeIds ?? [];
  const removedIds = prReview?.removedNodeIds ?? [];
  const initialHighlightJson = JSON.stringify({
    added: addedIds,
    modified: modifiedIds,
    removed: removedIds,
  });

  const prReviewHeader = prReview ? buildPrReviewHeader(prReview) : "";
  const prReviewStage = prReview ? buildPrReviewStage(prReview) : "";
  const nonce = makeNonce();

  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mermaid Preview</title>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css"
      />
      <script type="module" src="${scriptUri}"></script>
      <style>
        @font-face {
          font-family: "Recursive";
          src: url("${fontUrl}") format("woff2");
          font-weight: 300 900;
          font-style: normal;
        }
        #app {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow: hidden;
        }
        body {
          font-family: "Recursive", serif;
          padding: 0;
          margin: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .mc-pr-review-shell {
          position: relative;
          flex-shrink: 0;
          z-index: 300;
        }
        .mc-pr-review-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .mc-pr-review-body.has-chrome {
          position: relative;
        }
        .mc-pr-review-stage {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 200;
        }
        .mc-pr-review-stage .mc-changes-list,
        .mc-pr-review-stage .mc-review-toolbar {
          pointer-events: auto;
        }
        .mc-review-header-bar {
          flex-shrink: 0;
        }
        ${reviewChromeStyles()}
        /* Added nodes — green outline */
        .mermaid-pr-review-added > rect,
        .mermaid-pr-review-added > circle,
        .mermaid-pr-review-added > polygon,
        .mermaid-pr-review-added > path,
        .mermaid-pr-review-added > ellipse {
          fill: var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.25)) !important;
          stroke: var(--vscode-gitDecoration-addedResourceForeground, #4caf50) !important;
          stroke-width: 2.5px !important;
          animation: mermaid-pr-review-fade-in 240ms ease-out;
        }
        /* Modified nodes — amber outline */
        .mermaid-pr-review-modified > rect,
        .mermaid-pr-review-modified > circle,
        .mermaid-pr-review-modified > polygon,
        .mermaid-pr-review-modified > path,
        .mermaid-pr-review-modified > ellipse {
          fill: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground, #d29922) 18%, transparent) !important;
          stroke: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922) !important;
          stroke-width: 2.5px !important;
        }
        /* Removed nodes — red outline (Before view) */
        .mermaid-pr-review-removed > rect,
        .mermaid-pr-review-removed > circle,
        .mermaid-pr-review-removed > polygon,
        .mermaid-pr-review-removed > path,
        .mermaid-pr-review-removed > ellipse {
          fill: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground, #f85149) 20%, transparent) !important;
          stroke: var(--vscode-gitDecoration-deletedResourceForeground, #f85149) !important;
          stroke-width: 2.5px !important;
          stroke-dasharray: 5 3;
        }
        /* Click-to-focus — spotlight on selected node */
        #mermaid-diagram.mc-review-autofocus g.node,
        #mermaid-diagram.mc-review-autofocus g.classGroup,
        #mermaid-diagram.mc-review-autofocus g.stateGroup {
          transition: opacity 280ms ease, filter 280ms ease;
        }
        #mermaid-diagram.mc-review-autofocus g.node:not(.mermaid-pr-review-focus),
        #mermaid-diagram.mc-review-autofocus g.classGroup:not(.mermaid-pr-review-focus),
        #mermaid-diagram.mc-review-autofocus g.stateGroup:not(.mermaid-pr-review-focus) {
          opacity: 0.2 !important;
        }
        #mermaid-diagram.mc-review-autofocus .edgePath,
        #mermaid-diagram.mc-review-autofocus .edgeLabel,
        #mermaid-diagram.mc-review-autofocus .flowchart-link {
          opacity: 0.15 !important;
          transition: opacity 280ms ease;
        }
        #mermaid-diagram.mc-review-autofocus g.cluster rect {
          opacity: 0.35 !important;
        }
        .mermaid-pr-review-focus > rect,
        .mermaid-pr-review-focus > circle,
        .mermaid-pr-review-focus > polygon,
        .mermaid-pr-review-focus > path,
        .mermaid-pr-review-focus > ellipse {
          stroke-width: 3.5px !important;
          filter: drop-shadow(0 0 10px var(--vscode-focusBorder, #007fd4))
            drop-shadow(0 0 4px rgba(255, 255, 255, 0.35));
        }
        .mermaid-pr-review-focus {
          opacity: 1 !important;
        }
        /* Phase 2 enter animations — stagger via --mc-stagger on g.node */
        g.mermaid-pr-review-stagger-added > rect,
        g.mermaid-pr-review-stagger-added > circle,
        g.mermaid-pr-review-stagger-added > polygon,
        g.mermaid-pr-review-stagger-added > path,
        g.mermaid-pr-review-stagger-added > ellipse {
          animation: mc-review-pop-in 520ms cubic-bezier(0.22, 1, 0.36, 1) var(--mc-stagger, 0ms) both;
        }
        g.mermaid-pr-review-stagger-modified > rect,
        g.mermaid-pr-review-stagger-modified > circle,
        g.mermaid-pr-review-stagger-modified > polygon,
        g.mermaid-pr-review-stagger-modified > path,
        g.mermaid-pr-review-stagger-modified > ellipse {
          animation: mc-review-pulse-modified 640ms ease-out var(--mc-stagger, 0ms) both;
        }
        g.mermaid-pr-review-stagger-removed > rect,
        g.mermaid-pr-review-stagger-removed > circle,
        g.mermaid-pr-review-stagger-removed > polygon,
        g.mermaid-pr-review-stagger-removed > path,
        g.mermaid-pr-review-stagger-removed > ellipse {
          animation: mc-review-removed-in 520ms ease-out var(--mc-stagger, 0ms) both;
        }
        g.mermaid-pr-review-stagger-modified .label,
        g.mermaid-pr-review-stagger-modified text,
        g.mermaid-pr-review-stagger-modified foreignObject {
          animation: mc-review-label-reveal 560ms ease-out var(--mc-stagger, 0ms) both;
        }
        .mermaid-pr-review-added .label,
        .mermaid-pr-review-added text,
        .mermaid-pr-review-modified .label,
        .mermaid-pr-review-modified text,
        .mermaid-pr-review-removed .label,
        .mermaid-pr-review-removed text {
          font-weight: 600;
        }
        @keyframes mermaid-pr-review-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes mc-review-pop-in {
          0% { opacity: 0; stroke-width: 1px; transform: scale(0.92); transform-origin: center; transform-box: fill-box; }
          55% { opacity: 1; stroke-width: 3px; transform: scale(1.02); }
          100% { stroke-width: 2.5px; transform: scale(1); }
        }
        @keyframes mc-review-pulse-modified {
          0%, 100% { stroke-width: 2.5px; filter: none; }
          35% { stroke-width: 4px; filter: drop-shadow(0 0 8px rgba(210, 153, 34, 0.85)); }
          70% { stroke-width: 2.5px; }
        }
        @keyframes mc-review-removed-in {
          0% { opacity: 0; stroke-width: 1px; }
          100% { opacity: 1; stroke-width: 2.5px; }
        }
        @keyframes mc-review-label-reveal {
          0% { opacity: 0.25; }
          100% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          g.mermaid-pr-review-stagger-added > rect,
          g.mermaid-pr-review-stagger-added > circle,
          g.mermaid-pr-review-stagger-added > polygon,
          g.mermaid-pr-review-stagger-added > path,
          g.mermaid-pr-review-stagger-added > ellipse,
          g.mermaid-pr-review-stagger-modified > rect,
          g.mermaid-pr-review-stagger-modified > circle,
          g.mermaid-pr-review-stagger-modified > polygon,
          g.mermaid-pr-review-stagger-modified > path,
          g.mermaid-pr-review-stagger-modified > ellipse,
          g.mermaid-pr-review-stagger-removed > rect,
          g.mermaid-pr-review-stagger-removed > circle,
          g.mermaid-pr-review-stagger-removed > polygon,
          g.mermaid-pr-review-stagger-removed > path,
          g.mermaid-pr-review-stagger-removed > ellipse,
          g.mermaid-pr-review-stagger-modified .label,
          g.mermaid-pr-review-stagger-modified text,
          g.mermaid-pr-review-stagger-modified foreignObject,
          .mermaid-pr-review-added > rect,
          .mermaid-pr-review-added > circle,
          .mermaid-pr-review-modified > rect,
          .mermaid-pr-review-modified > circle {
            animation: none !important;
          }
          #mermaid-diagram.mc-review-fade {
            animation: none !important;
          }
        }
      </style>
    </head>
    <body>
      ${prReviewHeader}
      <div class="mc-pr-review-body${prReview ? " has-chrome" : ""}">
      ${prReviewStage}
      <div
        id="app"
        data-initial-content="${encodeURIComponent(initialContent)}"
        data-current-theme="${encodeURIComponent(currentTheme)}"
        data-max-zoom="${encodeURIComponent(String(options?.maxZoom ?? 5))}"
        data-max-char-length="${encodeURIComponent(String(options?.maxCharLength ?? 90000))}"
        data-max-edges="${encodeURIComponent(String(options?.maxEdges ?? 1000))}"
        ${prReview?.beforeDiagramText ? `data-before-content="${encodeURIComponent(prReview.beforeDiagramText)}"` : ""}
        ${prReview ? `data-pr-review="true"` : ""}
      ></div>
      </div>
      <script nonce="${nonce}">
        ${prReview ? reviewChromeScript(nonce) : ""}
      </script>
      <script>
        (function () {
          let highlights = ${initialHighlightJson};
          const ADDED_CLASS = "mermaid-pr-review-added";
          const MODIFIED_CLASS = "mermaid-pr-review-modified";
          const REMOVED_CLASS = "mermaid-pr-review-removed";
          const FOCUS_CLASS = "mermaid-pr-review-focus";
          const STAGGER_ADDED = "mermaid-pr-review-stagger-added";
          const STAGGER_MODIFIED = "mermaid-pr-review-stagger-modified";
          const STAGGER_REMOVED = "mermaid-pr-review-stagger-removed";
          const STAGGER_MS = 45;
          const MAX_STAGGER = 8;
          let focusNodeId = null;
          let hasInitialZoomed = false;
          let reviewPhase = "now";
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

          function nodeMatches(g, nodeId) {
            const id = g.getAttribute("id") || "";
            const parts = id.split("-");
            return parts.indexOf(nodeId) !== -1;
          }

          let activeFilter = null;

          function classifyNode(g) {
            const id = g.getAttribute("id") || "";
            const parts = id.split("-");
            for (let i = 0; i < highlights.added.length; i++) {
              if (parts.indexOf(highlights.added[i]) !== -1) return "added";
            }
            for (let j = 0; j < highlights.modified.length; j++) {
              if (parts.indexOf(highlights.modified[j]) !== -1) return "modified";
            }
            for (let k = 0; k < (highlights.removed || []).length; k++) {
              if (parts.indexOf(highlights.removed[k]) !== -1) return "removed";
            }
            return null;
          }

          let enterPass = false;

          function clearStaggerClasses(g) {
            g.classList.remove(STAGGER_ADDED, STAGGER_MODIFIED, STAGGER_REMOVED);
            g.style.removeProperty("--mc-stagger");
          }

          function applyStaggeredEnter() {
            if (!enterPass || reducedMotion.matches) return;
            let addedIdx = 0;
            let modifiedIdx = 0;
            let removedIdx = 0;
            document.querySelectorAll("g.node, g.classGroup, g.stateGroup").forEach(function (g) {
              clearStaggerClasses(g);
              const kind = classifyNode(g);
              if (kind === "added" && reviewPhase === "now") {
                const i = Math.min(addedIdx++, MAX_STAGGER);
                g.style.setProperty("--mc-stagger", i * STAGGER_MS + "ms");
                g.classList.add(STAGGER_ADDED);
              } else if (kind === "modified") {
                const i = Math.min(modifiedIdx++, MAX_STAGGER);
                g.style.setProperty("--mc-stagger", i * STAGGER_MS + "ms");
                g.classList.add(STAGGER_MODIFIED);
              } else if (kind === "removed" && reviewPhase === "before") {
                const i = Math.min(removedIdx++, MAX_STAGGER);
                g.style.setProperty("--mc-stagger", i * STAGGER_MS + "ms");
                g.classList.add(STAGGER_REMOVED);
              }
            });
          }

          function applyHighlight() {
            const hasAny =
              highlights.added.length ||
              highlights.modified.length ||
              (highlights.removed || []).length;
            let firstHighlighted = null;
            const diagramEl = document.getElementById("mermaid-diagram");
            if (diagramEl) {
              diagramEl.classList.toggle("mc-review-autofocus", !!focusNodeId);
            }
            document.querySelectorAll("g.node, g.classGroup, g.stateGroup").forEach(function (g) {
              clearStaggerClasses(g);
              const kind = classifyNode(g);
              const isFocus = focusNodeId && nodeMatches(g, focusNodeId);
              g.classList.toggle(ADDED_CLASS, kind === "added");
              g.classList.toggle(MODIFIED_CLASS, kind === "modified");
              g.classList.toggle(REMOVED_CLASS, kind === "removed");
              g.classList.toggle(FOCUS_CLASS, isFocus);
              const dim = activeFilter !== null && kind !== activeFilter;
              g.classList.toggle("mermaid-pr-review-dimmed", dim);
              if (kind && !firstHighlighted && !dim) {
                firstHighlighted = g;
              }
            });
            if (enterPass) {
              requestAnimationFrame(function () {
                requestAnimationFrame(applyStaggeredEnter);
              });
              enterPass = false;
            }
            if (!hasAny) return;
            if (firstHighlighted && !hasInitialZoomed && !focusNodeId) {
              requestAnimationFrame(function () {
                centerOnElement(firstHighlighted);
                hasInitialZoomed = true;
              });
            }
          }

          function centerOnElement(g) {
            if (!g) return;
            window.postMessage({ type: "centerOnNode", nodeId: getNodeIdFromGroup(g) }, "*");
          }

          function getNodeIdFromGroup(g) {
            const id = g.getAttribute("id") || "";
            const parts = id.split("-");
            const all = highlights.added
              .concat(highlights.modified)
              .concat(highlights.removed || []);
            for (let i = 0; i < all.length; i++) {
              if (parts.indexOf(all[i]) !== -1) return all[i];
            }
            return parts.length > 1 ? parts[1] : null;
          }

          function focusNode(nodeId, attempt) {
            if (attempt === undefined) attempt = 0;
            focusNodeId = nodeId;
            applyHighlight();
            window.dispatchEvent(new CustomEvent("mc-review-focus", { detail: { nodeId: nodeId } }));
            const groups = document.querySelectorAll("g.node, g.classGroup, g.stateGroup");
            for (let i = 0; i < groups.length; i++) {
              if (nodeMatches(groups[i], nodeId)) {
                centerOnElement(groups[i]);
                window.postMessage({ type: "centerOnNode", nodeId: nodeId, autofocus: true }, "*");
                return;
              }
            }
            if (attempt < 24) {
              setTimeout(function () { focusNode(nodeId, attempt + 1); }, 120);
            }
          }

          function clearFocus() {
            focusNodeId = null;
            applyHighlight();
            window.dispatchEvent(new CustomEvent("mc-review-focus", { detail: { nodeId: null } }));
          }

          window.addEventListener("mc-review-filter", function (e) {
            activeFilter = e.detail && e.detail.filter ? e.detail.filter : null;
            applyHighlight();
          });

          const observer = new MutationObserver(function () {
            applyHighlight();
          });
          observer.observe(document.body, { childList: true, subtree: true });

          window.addEventListener("message", function (event) {
            const msg = event && event.data;
            if (!msg) return;
            if (msg.type === "highlightNodes") {
              highlights = {
                added: Array.isArray(msg.addedNodeIds) ? msg.addedNodeIds : [],
                modified: Array.isArray(msg.modifiedNodeIds) ? msg.modifiedNodeIds : [],
                removed: Array.isArray(msg.removedNodeIds) ? msg.removedNodeIds : (highlights.removed || []),
              };
              reviewPhase = msg.phase === "before" ? "before" : "now";
              clearFocus();
              enterPass = true;
              hasInitialZoomed = false;
              applyHighlight();
            } else if (msg.type === "focusNode" && msg.nodeId) {
              focusNode(msg.nodeId);
            } else if (msg.type === "resetInitialZoom") {
              hasInitialZoomed = false;
              focusNodeId = null;
            }
          });

          applyHighlight();
        })();
      </script>
    </body>
    </html>
  `;
}

function buildPrReviewHeader(ctx: PrReviewPreviewContext): string {
    const summary = renderSummaryChips(ctx.counts);
    const meta = renderMetaChips({ prRef: ctx.prRef });
    const theme = renderThemeSelect(ctx.currentTheme ?? "redux-dark");
    const actions = renderHeaderActionButtons();
    return `<header class="mc-review-header-bar mc-review-chrome">${summary}<div class="mc-header-actions mc-review-chrome">${meta}${theme}${actions}</div></header>`;
}

function buildPrReviewStage(ctx: PrReviewPreviewContext): string {
    const changes = renderChangesList(ctx.changes);
    const toggle = renderNowBeforeToggle("now");
    return `<div class="mc-pr-review-stage">
        ${changes}
        <div class="mc-review-toolbar mc-review-chrome">
          <button type="button" class="mc-pill-link" data-action="compare-side-by-side">Compare side by side</button>
          ${toggle}
        </div>
      </div>`;
}

function makeNonce(): string {
    let n = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        n += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return n;
}

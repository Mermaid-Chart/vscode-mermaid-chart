import * as vscode from "vscode";
import * as path from "path";
import {
    DiagramChangeItem,
    DiagramDiffCounts,
} from "../commercial/sync/diagramDiffHighlighter";
import {
    renderChangesList,
    renderHeaderActionButtons,
    renderMetaChips,
    renderNowBeforeToggle,
    renderSummaryChips,
    renderThemeSelect,
    reviewChromeScript,
    reviewChromeStyles,
} from "../commercial/sync/reviewChrome";

export interface ReviewDiagramPreviewContext {
    counts: DiagramDiffCounts;
    changes: DiagramChangeItem[];
    addedNodeIds: string[];
    modifiedNodeIds: string[];
  reviewRef?: string;
  themeLabel?: string;
  /** Mermaid theme key passed to the webview renderer. */
  currentTheme?: string;
  /** Workbench theme name for theme picker colors (matches preview panel). */
  vscodeThemeName?: string;
  fileName?: string;
  removedNodeIds?: string[];
    /** Encoded diagram text for the before state — swapped in via postMessage. */
    beforeDiagramText?: string;
    /** Host hint: `ast` when AST mappings exist — relaxes SVG id match threshold for review chrome. */
    highlightCapability?: "ast" | "none";
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
  nodeHighlights?: {
    addedNodeIds: string[];
    modifiedNodeIds: string[];
    removedNodeIds: string[];
  },
  reviewDiagram?: ReviewDiagramPreviewContext,
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

  const addedIds =
    reviewDiagram?.addedNodeIds ??
    nodeHighlights?.addedNodeIds ??
    highlightAddedNodeIds ??
    [];
  const modifiedIds = reviewDiagram?.modifiedNodeIds ?? nodeHighlights?.modifiedNodeIds ?? [];
  const removedIds = reviewDiagram?.removedNodeIds ?? nodeHighlights?.removedNodeIds ?? [];
  const initialHighlightJson = JSON.stringify({
    added: addedIds,
    modified: modifiedIds,
    removed: removedIds,
  });
  const enableNodeHighlights =
    addedIds.length > 0 || modifiedIds.length > 0 || removedIds.length > 0;

  const reviewHeader = reviewDiagram ? buildReviewDiagramHeader(reviewDiagram) : "";
  const reviewStage = reviewDiagram ? buildReviewDiagramStage(reviewDiagram) : "";
  const nonce = makeNonce();
  const reviewInteraction = Boolean(reviewDiagram);
  const hostHighlightCapability = reviewDiagram?.highlightCapability ?? "none";

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
        .mc-review-diagram-shell {
          position: relative;
          flex-shrink: 0;
          z-index: 300;
        }
        .mc-review-diagram-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .mc-review-diagram-body.has-chrome {
          position: relative;
        }
        .mc-review-diagram-stage {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 200;
        }
        .mc-review-diagram-stage .mc-changes-panel,
        .mc-review-diagram-stage .mc-review-toolbar {
          pointer-events: auto;
        }
        .mc-review-header-bar {
          flex-shrink: 0;
        }
        ${reviewDiagram ? reviewChromeStyles() : ""}
        /* Added nodes — green outline */
        .mermaid-review-diagram-added > rect,
        .mermaid-review-diagram-added > circle,
        .mermaid-review-diagram-added > polygon,
        .mermaid-review-diagram-added > path,
        .mermaid-review-diagram-added > ellipse {
          fill: var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.25)) !important;
          stroke: var(--vscode-gitDecoration-addedResourceForeground, #4caf50) !important;
          stroke-width: 2.5px !important;
          animation: mermaid-review-diagram-fade-in 240ms ease-out;
        }
        /* Modified nodes — amber outline */
        .mermaid-review-diagram-modified > rect,
        .mermaid-review-diagram-modified > circle,
        .mermaid-review-diagram-modified > polygon,
        .mermaid-review-diagram-modified > path,
        .mermaid-review-diagram-modified > ellipse {
          fill: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground, #d29922) 18%, transparent) !important;
          stroke: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922) !important;
          stroke-width: 2.5px !important;
        }
        /* Removed nodes — red outline (Before view) */
        .mermaid-review-diagram-removed > rect,
        .mermaid-review-diagram-removed > circle,
        .mermaid-review-diagram-removed > polygon,
        .mermaid-review-diagram-removed > path,
        .mermaid-review-diagram-removed > ellipse {
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
        #mermaid-diagram.mc-review-autofocus g.node:not(.mermaid-review-diagram-focus),
        #mermaid-diagram.mc-review-autofocus g.classGroup:not(.mermaid-review-diagram-focus),
        #mermaid-diagram.mc-review-autofocus g.stateGroup:not(.mermaid-review-diagram-focus) {
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
        .mermaid-review-diagram-focus > rect,
        .mermaid-review-diagram-focus > circle,
        .mermaid-review-diagram-focus > polygon,
        .mermaid-review-diagram-focus > path,
        .mermaid-review-diagram-focus > ellipse {
          stroke-width: 3.5px !important;
          filter: drop-shadow(0 0 10px var(--vscode-focusBorder, #007fd4))
            drop-shadow(0 0 4px rgba(255, 255, 255, 0.35));
        }
        .mermaid-review-diagram-focus {
          opacity: 1 !important;
        }
        /* Phase 2 enter animations — stagger via --mc-stagger on g.node */
        g.mermaid-review-diagram-stagger-added > rect,
        g.mermaid-review-diagram-stagger-added > circle,
        g.mermaid-review-diagram-stagger-added > polygon,
        g.mermaid-review-diagram-stagger-added > path,
        g.mermaid-review-diagram-stagger-added > ellipse {
          animation: mc-review-pop-in 520ms cubic-bezier(0.22, 1, 0.36, 1) var(--mc-stagger, 0ms) both;
        }
        g.mermaid-review-diagram-stagger-modified > rect,
        g.mermaid-review-diagram-stagger-modified > circle,
        g.mermaid-review-diagram-stagger-modified > polygon,
        g.mermaid-review-diagram-stagger-modified > path,
        g.mermaid-review-diagram-stagger-modified > ellipse {
          animation: mc-review-pulse-modified 640ms ease-out var(--mc-stagger, 0ms) both;
        }
        g.mermaid-review-diagram-stagger-removed > rect,
        g.mermaid-review-diagram-stagger-removed > circle,
        g.mermaid-review-diagram-stagger-removed > polygon,
        g.mermaid-review-diagram-stagger-removed > path,
        g.mermaid-review-diagram-stagger-removed > ellipse {
          animation: mc-review-removed-in 520ms ease-out var(--mc-stagger, 0ms) both;
        }
        g.mermaid-review-diagram-stagger-modified .label,
        g.mermaid-review-diagram-stagger-modified text,
        g.mermaid-review-diagram-stagger-modified foreignObject {
          animation: mc-review-label-reveal 560ms ease-out var(--mc-stagger, 0ms) both;
        }
        .mermaid-review-diagram-added .label,
        .mermaid-review-diagram-added text,
        .mermaid-review-diagram-modified .label,
        .mermaid-review-diagram-modified text,
        .mermaid-review-diagram-removed .label,
        .mermaid-review-diagram-removed text {
          font-weight: 600;
        }
        @keyframes mermaid-review-diagram-fade-in {
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
          g.mermaid-review-diagram-stagger-added > rect,
          g.mermaid-review-diagram-stagger-added > circle,
          g.mermaid-review-diagram-stagger-added > polygon,
          g.mermaid-review-diagram-stagger-added > path,
          g.mermaid-review-diagram-stagger-added > ellipse,
          g.mermaid-review-diagram-stagger-modified > rect,
          g.mermaid-review-diagram-stagger-modified > circle,
          g.mermaid-review-diagram-stagger-modified > polygon,
          g.mermaid-review-diagram-stagger-modified > path,
          g.mermaid-review-diagram-stagger-modified > ellipse,
          g.mermaid-review-diagram-stagger-removed > rect,
          g.mermaid-review-diagram-stagger-removed > circle,
          g.mermaid-review-diagram-stagger-removed > polygon,
          g.mermaid-review-diagram-stagger-removed > path,
          g.mermaid-review-diagram-stagger-removed > ellipse,
          g.mermaid-review-diagram-stagger-modified .label,
          g.mermaid-review-diagram-stagger-modified text,
          g.mermaid-review-diagram-stagger-modified foreignObject,
          .mermaid-review-diagram-added > rect,
          .mermaid-review-diagram-added > circle,
          .mermaid-review-diagram-modified > rect,
          .mermaid-review-diagram-modified > circle {
            animation: none !important;
          }
          #mermaid-diagram.mc-review-fade {
            animation: none !important;
          }
        }
      </style>
    </head>
    <body>
      ${reviewHeader}
      <div class="mc-review-diagram-body${reviewDiagram ? " has-chrome" : ""}">
      ${reviewStage}
      <div
        id="app"
        data-initial-content="${encodeURIComponent(initialContent)}"
        data-current-theme="${encodeURIComponent(currentTheme)}"
        data-max-zoom="${encodeURIComponent(String(options?.maxZoom ?? 5))}"
        data-max-char-length="${encodeURIComponent(String(options?.maxCharLength ?? 90000))}"
        data-max-edges="${encodeURIComponent(String(options?.maxEdges ?? 1000))}"
        ${reviewDiagram?.beforeDiagramText ? `data-before-content="${encodeURIComponent(reviewDiagram.beforeDiagramText)}"` : ""}
        ${reviewDiagram ? `data-review-diagram="true"` : ""}
      ></div>
      </div>
      <script nonce="${nonce}">
        ${reviewDiagram ? reviewChromeScript(nonce) : ""}
      </script>
      ${enableNodeHighlights ? `<script>
        (function () {
          let highlights = ${initialHighlightJson};
          const reviewInteraction = ${reviewInteraction};
          const hostHighlightCapability = ${JSON.stringify(hostHighlightCapability)};
          let svgHighlightsActive = null;
          let focusTargetMatched = false;
          const ADDED_CLASS = "mermaid-review-diagram-added";
          const MODIFIED_CLASS = "mermaid-review-diagram-modified";
          const REMOVED_CLASS = "mermaid-review-diagram-removed";
          const FOCUS_CLASS = "mermaid-review-diagram-focus";
          const STAGGER_ADDED = "mermaid-review-diagram-stagger-added";
          const STAGGER_MODIFIED = "mermaid-review-diagram-stagger-modified";
          const STAGGER_REMOVED = "mermaid-review-diagram-stagger-removed";
          const STAGGER_MS = 45;
          const MAX_STAGGER = 8;
          let focusNodeId = null;
          let focusGeneration = 0;
          let hasInitialZoomed = false;
          let reviewPhase = "now";
          let highlightTimer = null;
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

          function nodeMatches(g, nodeId) {
            const id = g.getAttribute("id") || "";
            const parts = id.split("-");
            return parts.indexOf(nodeId) !== -1;
          }

          let activeFilter = null;

          function allHighlightIds() {
            return highlights.added
              .concat(highlights.modified)
              .concat(highlights.removed || []);
          }

          function resetSvgHighlightCapability() {
            svgHighlightsActive = null;
          }

          /** True when diff node IDs map to rendered SVG groups (dynamic; no per-diagram hardcoding). */
          function canPaintSvgHighlights() {
            if (svgHighlightsActive !== null) {
              return svgHighlightsActive;
            }
            const groups = document.querySelectorAll("g.node, g.classGroup, g.stateGroup");
            if (!groups.length) {
              return false;
            }
            const ids = allHighlightIds();
            if (!ids.length) {
              svgHighlightsActive = false;
              return false;
            }
            let matched = 0;
            for (let i = 0; i < ids.length; i++) {
              for (let j = 0; j < groups.length; j++) {
                if (nodeMatches(groups[j], ids[i])) {
                  matched++;
                  break;
                }
              }
            }
            const ratio = matched / ids.length;
            if (hostHighlightCapability === "ast") {
              svgHighlightsActive = matched > 0;
            } else {
              svgHighlightsActive = matched > 0 && ratio >= 0.2;
            }
            return svgHighlightsActive;
          }

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

          function scheduleApplyHighlight() {
            if (highlightTimer) {
              clearTimeout(highlightTimer);
            }
            highlightTimer = setTimeout(function () {
              highlightTimer = null;
              applyHighlight();
            }, 48);
          }

          function applyHighlight() {
            const hasAny =
              highlights.added.length ||
              highlights.modified.length ||
              (highlights.removed || []).length;
            const paint = canPaintSvgHighlights();
            let firstHighlighted = null;
            const diagramEl = document.getElementById("mermaid-diagram");
            if (diagramEl) {
              diagramEl.classList.toggle(
                "mc-review-autofocus",
                paint && reviewInteraction && !!focusNodeId && focusTargetMatched,
              );
            }
            document.querySelectorAll("g.node, g.classGroup, g.stateGroup").forEach(function (g) {
              clearStaggerClasses(g);
              if (!paint) {
                g.classList.remove(
                  ADDED_CLASS,
                  MODIFIED_CLASS,
                  REMOVED_CLASS,
                  FOCUS_CLASS,
                  "mermaid-review-diagram-dimmed",
                );
                return;
              }
              const kind = classifyNode(g);
              const isFocus = focusNodeId && nodeMatches(g, focusNodeId);
              g.classList.toggle(ADDED_CLASS, kind === "added");
              g.classList.toggle(MODIFIED_CLASS, kind === "modified");
              g.classList.toggle(REMOVED_CLASS, kind === "removed");
              g.classList.toggle(FOCUS_CLASS, isFocus);
              const dim = reviewInteraction && activeFilter !== null && kind !== activeFilter;
              g.classList.toggle("mermaid-review-diagram-dimmed", dim);
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
            if (!hasAny || !paint) return;
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

          function focusNode(nodeId, attempt, generation) {
            if (attempt === undefined) attempt = 0;
            if (generation === undefined) {
              generation = ++focusGeneration;
            } else if (generation !== focusGeneration) {
              return;
            }
            focusNodeId = nodeId;
            focusTargetMatched = false;
            applyHighlight();
            if (reviewInteraction) {
              window.dispatchEvent(new CustomEvent("mc-review-focus", { detail: { nodeId: nodeId } }));
            }
            const groups = document.querySelectorAll("g.node, g.classGroup, g.stateGroup");
            for (let i = 0; i < groups.length; i++) {
              if (nodeMatches(groups[i], nodeId)) {
                focusTargetMatched = true;
                applyHighlight();
                centerOnElement(groups[i]);
                const useSpotlight = canPaintSvgHighlights();
                window.postMessage({
                  type: "centerOnNode",
                  nodeId: nodeId,
                  autofocus: useSpotlight,
                }, "*");
                return;
              }
            }
            if (attempt < 12) {
              setTimeout(function () { focusNode(nodeId, attempt + 1, generation); }, 100);
              return;
            }
            focusNodeId = null;
            applyHighlight();
          }

          function clearFocus() {
            focusGeneration++;
            focusNodeId = null;
            focusTargetMatched = false;
            applyHighlight();
            if (reviewInteraction) {
              window.dispatchEvent(new CustomEvent("mc-review-focus", { detail: { nodeId: null } }));
            }
          }

          if (reviewInteraction) {
            window.addEventListener("mc-review-filter", function (e) {
              activeFilter = e.detail && e.detail.filter ? e.detail.filter : null;
              clearFocus();
            });
          }

          const observer = new MutationObserver(function () {
            scheduleApplyHighlight();
          });
          observer.observe(document.getElementById("mermaid-diagram") || document.body, {
            childList: true,
            subtree: true,
          });

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
              resetSvgHighlightCapability();
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
      </script>` : ""}
    </body>
    </html>
  `;
}

function buildReviewDiagramHeader(ctx: ReviewDiagramPreviewContext): string {
    const summary = renderSummaryChips(ctx.counts);
    const meta = renderMetaChips({ reviewRef: ctx.reviewRef });
    const theme = renderThemeSelect(ctx.currentTheme ?? "redux-dark", ctx.vscodeThemeName);
    const actions = renderHeaderActionButtons();
    return `<header class="mc-review-header-bar mc-review-chrome"><div id="mc-review-summary-chips">${summary}</div><div class="mc-header-actions mc-review-chrome">${meta}${theme}${actions}</div></header>`;
}

function buildReviewDiagramStage(ctx: ReviewDiagramPreviewContext): string {
    const changes = renderChangesList(ctx.changes);
    const toggle = renderNowBeforeToggle("now");
    return `<div class="mc-review-diagram-stage">
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


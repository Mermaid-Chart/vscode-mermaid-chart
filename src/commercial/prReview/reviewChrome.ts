import {
    DiagramChangeItem,
    DiagramDiffCounts,
} from "./diagramNodeDiff";

/** Diagram themes available in the preview webview (matches ThemeSelector.svelte). */
export const MERMAID_PREVIEW_THEMES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "redux-dark", label: "Redux Dark" },
    { key: "redux", label: "Redux" },
    { key: "redux-color", label: "Redux Color" },
    { key: "redux-dark-color", label: "Redux Dark Color" },
    { key: "neo-dark", label: "Neo Dark" },
    { key: "neo", label: "Neo" },
    { key: "mc", label: "Mermaid Chart" },
    { key: "default", label: "Default" },
    { key: "dark", label: "Dark" },
    { key: "forest", label: "Forest" },
    { key: "base", label: "Base" },
    { key: "neutral", label: "Neutral" },
];

const SAVE_ICON_SVG = /* svg */ `<svg class="mc-pill-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 1.5l4.5 4.5v7.5H3.5V6L8 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M8 1.5v5h4.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

const BRANCH_ICON_SVG = /* svg */ `<svg class="mc-pill-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M4.5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6 5v2.2c0 .8.5 1.5 1.2 1.8L10 10v1.5H6V14h4.5a1 1 0 0 0 1-1V9.8L8.2 8.2A1.5 1.5 0 0 1 7.5 6.5V5H6z"/>
</svg>`;

/** Shared chrome — dark rounded pills matching product toolbar reference. */
export function reviewChromeStyles(): string {
    return /* css */ `
  .mc-review-chrome {
    --mc-pill-bg: color-mix(in srgb, var(--vscode-editor-background) 88%, #3a3a3a);
    --mc-pill-border: color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
    --mc-pill-text: var(--vscode-foreground, #e8e8e8);
    --mc-pill-muted: var(--vscode-descriptionForeground, #9a9a9a);
    --mc-dot-added: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --mc-dot-modified: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922);
    --mc-dot-removed: var(--vscode-gitDecoration-deletedResourceForeground, #f85149);
    --mc-dot-branch: var(--vscode-charts-teal, #2dd4bf);
    --mc-dot-now: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --mc-save-accent: #e879a8;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--mc-pill-text);
  }

  .mc-pill-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .mc-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid var(--mc-pill-border);
    background: var(--mc-pill-bg);
    color: var(--mc-pill-text);
    font: inherit;
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    box-sizing: border-box;
  }

  button.mc-pill {
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  button.mc-pill:hover {
    background: color-mix(in srgb, var(--mc-pill-bg) 70%, var(--vscode-toolbar-hoverBackground));
  }
  button.mc-pill.filter-active {
    border-color: color-mix(in srgb, var(--mc-pill-text) 35%, var(--mc-pill-border));
    background: color-mix(in srgb, var(--vscode-editor-background) 60%, #404040);
  }
  button.mc-pill.filter-added.filter-active {
    border-color: color-mix(in srgb, var(--mc-dot-added) 55%, var(--mc-pill-border));
  }
  button.mc-pill.filter-modified.filter-active {
    border-color: color-mix(in srgb, var(--mc-dot-modified) 55%, var(--mc-pill-border));
  }
  button.mc-pill.filter-removed.filter-active {
    border-color: color-mix(in srgb, var(--mc-dot-removed) 55%, var(--mc-pill-border));
  }

  .mc-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mc-status-dot.added { background: var(--mc-dot-added); }
  .mc-status-dot.modified { background: var(--mc-dot-modified); }
  .mc-status-dot.removed { background: var(--mc-dot-removed); }
  .mc-status-dot.branch { background: var(--mc-dot-branch); }
  .mc-status-dot.theme {
    background: conic-gradient(#ff6b6b, #feca57, #48dbfb, #ff9ff3, #ff6b6b);
  }
  .mc-status-dot.now { background: var(--mc-dot-now); }

  .mc-pill-label { font-weight: 500; }
  .mc-pill-meta {
    color: var(--mc-pill-muted);
    font-weight: 400;
    margin-left: 2px;
  }

  .mc-pill-icon {
    flex-shrink: 0;
    opacity: 0.95;
  }
  .mc-pill-branch .mc-pill-icon { color: var(--mc-dot-branch); }
  .mc-pill-action .mc-pill-icon { color: var(--mc-save-accent); }

  .mc-pill-theme {
    padding: 4px 10px 4px 8px;
    gap: 6px;
  }
  .mc-pill-theme select {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--mc-pill-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    margin: 0;
    max-width: 120px;
  }
  .mc-pill-theme select:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .mc-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mc-segmented-pill {
    display: inline-flex;
    align-items: stretch;
    min-height: 28px;
    border-radius: 8px;
    border: 1px solid var(--mc-pill-border);
    background: var(--mc-pill-bg);
    overflow: hidden;
  }
  .mc-segmented-pill button {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--mc-pill-muted);
    padding: 5px 14px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: color 120ms ease, background 120ms ease;
  }
  .mc-segmented-pill button.active {
    background: color-mix(in srgb, var(--vscode-editor-background) 55%, #454545);
    color: var(--mc-pill-text);
    font-weight: 500;
  }
  .mc-segmented-pill button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  /* Changes panel — compact, grouped, easy to scan */
  .mc-changes-panel {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 200;
    width: min(260px, calc(100% - 20px));
    max-height: min(52vh, 340px);
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--mc-pill-border);
    background: color-mix(in srgb, var(--vscode-editor-background) 94%, #000);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    pointer-events: auto;
  }
  .mc-changes-scroll {
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mc-changes-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mc-changes-group-label {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 4px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--mc-pill-muted);
  }
  .mc-changes-group-label .mc-status-dot {
    width: 7px;
    height: 7px;
  }

  .mc-change-row-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 8px;
    border: 1px solid transparent;
    padding-right: 4px;
    transition: border-color 100ms ease, background 100ms ease;
  }
  .mc-change-row-wrap.list-focus {
    border-color: var(--vscode-focusBorder);
    background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 40%, var(--mc-pill-bg));
  }

  button.mc-change-row {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 7px 8px 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--mc-pill-text);
    font: inherit;
    font-size: 12px;
    line-height: 1.3;
    cursor: pointer;
    transition: background 100ms ease;
  }
  button.mc-change-row:hover {
    background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 65%, transparent);
  }
  .mc-change-row-wrap.filter-hidden { display: none; }
  .mc-change-row-wrap.hidden { display: none; }

  button.mc-view-code-link {
    appearance: none;
    display: none;
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  button.mc-view-code-link:hover {
    background: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent);
    text-decoration: underline;
  }
  .mc-change-row-wrap.list-focus button.mc-view-code-link {
    display: inline-flex;
  }

  .mc-change-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mc-change-row.removed .mc-change-label {
    text-decoration: line-through;
    color: var(--mc-pill-muted);
  }

  .mc-changes-more {
    margin-top: 2px;
    padding: 4px 8px;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    border-radius: 6px;
  }
  .mc-changes-more:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .mc-review-toolbar {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
    pointer-events: auto;
  }
  .mc-review-toolbar .mc-pill-link {
    appearance: none;
    border: none;
    background: var(--mc-pill-bg);
    border: 1px solid var(--mc-pill-border);
    border-radius: 8px;
    color: var(--mc-pill-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 5px 12px;
    min-height: 28px;
    transition: color 120ms ease, background 120ms ease;
  }
  .mc-review-toolbar .mc-pill-link:hover {
    color: var(--mc-pill-text);
    background: color-mix(in srgb, var(--mc-pill-bg) 70%, var(--vscode-toolbar-hoverBackground));
  }

  .mc-review-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--mc-pill-border);
    background: var(--vscode-editor-background);
    flex-shrink: 0;
  }

  #mermaid-diagram.mc-review-fade {
    animation: mc-review-pane-fade 240ms ease-out;
  }
  @keyframes mc-review-pane-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .mermaid-pr-review-dimmed {
    opacity: 0.12 !important;
    pointer-events: none;
  }
`;
}

export function renderSummaryChips(counts: DiagramDiffCounts): string {
    const chips: string[] = [];
    if (counts.added > 0) {
        chips.push(filterPill("added", "Added", counts.added));
    }
    if (counts.modified > 0) {
        chips.push(filterPill("modified", "Changed", counts.modified));
    }
    if (counts.removed > 0) {
        chips.push(filterPill("removed", "Removed", counts.removed));
    }
    return `<div class="mc-pill-row mc-review-chrome" role="group" aria-label="Filter changes">${chips.join("")}</div>`;
}

function filterPill(kind: string, label: string, count: number): string {
    return (
        `<button type="button" class="mc-pill filter-${kind} mc-review-chrome" data-filter="${kind}" aria-pressed="false">` +
        `<span class="mc-status-dot ${kind}" aria-hidden="true"></span>` +
        `<span class="mc-pill-label">${label}</span>` +
        `<span class="mc-pill-meta">${count}</span></button>`
    );
}

export function renderThemeSelect(currentTheme: string): string {
    const options = MERMAID_PREVIEW_THEMES.map(
        (t) =>
            `<option value="${escapeHtml(t.key)}"${t.key === currentTheme ? " selected" : ""}>${escapeHtml(t.label)}</option>`,
    ).join("");
    return (
        `<label class="mc-pill mc-pill-theme mc-review-chrome" title="Diagram theme">` +
        `<span class="mc-status-dot theme" aria-hidden="true"></span>` +
        `<select data-action="theme-select" aria-label="Diagram theme">${options}</select>` +
        `</label>`
    );
}

export function renderHeaderActionButtons(): string {
    return (
        `<button type="button" class="mc-pill mc-pill-action mc-review-chrome" data-action="export-diagram" title="Save / export diagram">` +
        `${SAVE_ICON_SVG}<span class="mc-pill-label">Save diagram</span></button>` +
        `<button type="button" class="mc-pill mc-review-chrome" data-action="view-diff-code" title="Open source diff in editor">` +
        `<span class="mc-pill-label">Diff code</span></button>`
    );
}

export function renderMetaChips(opts: { prRef?: string }): string {
    if (!opts.prRef?.trim()) {
        return "";
    }
    const ref = escapeHtml(opts.prRef.trim());
    return (
        `<span class="mc-pill mc-pill-branch mc-review-chrome" title="Pull request">` +
        `${BRANCH_ICON_SVG}` +
        `<span class="mc-pill-label">${ref}</span></span>`
    );
}

export function renderNowBeforeToggle(activePhase: "now" | "before" = "now"): string {
    const nowActive = activePhase === "now" ? " active" : "";
    const beforeActive = activePhase === "before" ? " active" : "";
    return `<div class="mc-segmented-pill mc-review-chrome" role="group" aria-label="Compare diagram state">
      <button type="button" class="phase-now${nowActive}" data-phase="now">
        <span class="mc-status-dot now" aria-hidden="true"></span><span>Now</span>
      </button>
      <button type="button" class="phase-before${beforeActive}" data-phase="before"><span>Before</span></button>
    </div>`;
}

const VISIBLE_PER_GROUP = 5;

const GROUP_ORDER: DiagramChangeItem["kind"][] = ["added", "modified", "removed"];
const GROUP_TITLES: Record<DiagramChangeItem["kind"], string> = {
    added: "Added",
    modified: "Changed",
    removed: "Removed",
};

export function renderChangesList(changes: DiagramChangeItem[]): string {
    if (!changes.length) {
        return "";
    }

    const byKind: Record<DiagramChangeItem["kind"], DiagramChangeItem[]> = {
        added: [],
        modified: [],
        removed: [],
    };
    for (const c of changes) {
        byKind[c.kind].push(c);
    }

    const sections: string[] = [];
    let hiddenTotal = 0;

    for (const kind of GROUP_ORDER) {
        const items = byKind[kind];
        if (!items.length) {
            continue;
        }
        const visible = items.slice(0, VISIBLE_PER_GROUP);
        const hidden = items.length - visible.length;
        hiddenTotal += hidden;

        const rows = visible.map((c) => changeRowHtml(c, false)).join("");
        const hiddenRows = items.slice(VISIBLE_PER_GROUP).map((c) => changeRowHtml(c, true)).join("");

        const moreBtn =
            hidden > 0
                ? `<button type="button" class="mc-changes-more" data-action="expand-group" data-kind="${kind}">+${hidden} more</button>`
                : "";

        sections.push(
            `<section class="mc-changes-group" data-group="${kind}">` +
            `<div class="mc-changes-group-label"><span class="mc-status-dot ${kind}"></span>${GROUP_TITLES[kind]}</div>` +
            `${rows}${hiddenRows}${moreBtn}</section>`,
        );
    }

    const expandAll =
        hiddenTotal > 0
            ? `<button type="button" class="mc-changes-more" data-action="expand-changes" style="margin-top:4px">Show all ${changes.length}</button>`
            : "";

    return `<nav class="mc-changes-panel mc-review-chrome" aria-label="Diagram changes">
      <div class="mc-changes-scroll">${sections.join("")}${expandAll}</div>
    </nav>`;
}

export function reviewChromeScript(_nonce: string): string {
    return /* js */ `
    (function () {
      var w = window;
      if (!w.__mermaidVscodeApi && typeof acquireVsCodeApi === "function") {
        w.__mermaidVscodeApi = acquireVsCodeApi();
      }
      var vscode = w.__mermaidVscodeApi;
      if (!vscode) return;

      var activeFilter = null;
      var list = document.querySelector(".mc-changes-panel");

      function setFilter(next) {
        activeFilter = activeFilter === next ? null : next;
        document.querySelectorAll("button.mc-pill[data-filter]").forEach(function (btn) {
          var f = btn.getAttribute("data-filter");
          var on = activeFilter === f;
          btn.classList.toggle("filter-active", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        if (list) {
          list.querySelectorAll(".mc-change-row-wrap[data-kind]").forEach(function (wrap) {
            var kind = wrap.getAttribute("data-kind");
            wrap.classList.toggle("filter-hidden", activeFilter !== null && kind !== activeFilter);
          });
          list.querySelectorAll(".mc-changes-group").forEach(function (grp) {
            var kind = grp.getAttribute("data-group");
            grp.style.display = activeFilter !== null && kind !== activeFilter ? "none" : "";
          });
        }
        w.dispatchEvent(new CustomEvent("mc-review-filter", { detail: { filter: activeFilter } }));
      }

      document.querySelectorAll("button.mc-pill[data-filter]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          setFilter(btn.getAttribute("data-filter"));
        });
      });

      var themeSelect = document.querySelector("[data-action=theme-select]");
      if (themeSelect) {
        themeSelect.addEventListener("change", function () {
          vscode.postMessage({ type: "setTheme", theme: themeSelect.value });
        });
      }

      var exportBtn = document.querySelector("[data-action=export-diagram]");
      if (exportBtn) {
        exportBtn.addEventListener("click", function () {
          vscode.postMessage({ type: "openExport" });
        });
      }

      var diffBtn = document.querySelector("[data-action=view-diff-code]");
      if (diffBtn) {
        diffBtn.addEventListener("click", function () {
          vscode.postMessage({ type: "viewDiffCode" });
        });
      }

      if (list) {
        list.querySelectorAll("button.mc-change-row[data-node-id]").forEach(function (row) {
          row.addEventListener("click", function (ev) {
            if (ev.target.closest("[data-action=view-change-code]")) return;
            var nodeId = row.getAttribute("data-node-id");
            if (nodeId) {
              vscode.postMessage({ type: "focusChange", nodeId: nodeId });
            }
          });
        });
        list.querySelectorAll("[data-action=view-change-code]").forEach(function (btn) {
          btn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            var nodeId = btn.getAttribute("data-node-id");
            var kind = btn.getAttribute("data-kind") || "modified";
            var changeLabel = btn.getAttribute("data-label") || "";
            if (nodeId) {
              vscode.postMessage({
                type: "viewChangeCode",
                nodeId: nodeId,
                kind: kind,
                changeLabel: changeLabel,
              });
            }
          });
        });
        list.querySelectorAll("[data-action=expand-group]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var kind = btn.getAttribute("data-kind");
            var grp = list.querySelector('.mc-changes-group[data-group="' + kind + '"]');
            if (grp) {
              grp.querySelectorAll(".mc-change-row-wrap.hidden").forEach(function (w) {
                w.classList.remove("hidden");
              });
              btn.remove();
            }
          });
        });
        var expandAll = list.querySelector("[data-action=expand-changes]");
        if (expandAll) {
          expandAll.addEventListener("click", function () {
            list.querySelectorAll(".mc-change-row-wrap.hidden").forEach(function (w) {
              w.classList.remove("hidden");
            });
            list.querySelectorAll("[data-action=expand-group]").forEach(function (b) {
              b.remove();
            });
            expandAll.remove();
          });
        }
      }

      document.querySelectorAll(".mc-segmented-pill button[data-phase]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var phase = btn.getAttribute("data-phase");
          if (!phase) return;
          var pill = btn.closest(".mc-segmented-pill");
          if (pill) {
            pill.querySelectorAll("button[data-phase]").forEach(function (b) {
              b.classList.toggle("active", b.getAttribute("data-phase") === phase);
            });
          }
          vscode.postMessage({ type: "switchPhase", phase: phase });
        });
      });

      var sideBySide = document.querySelector("[data-action=compare-side-by-side]");
      if (sideBySide) {
        sideBySide.addEventListener("click", function () {
          vscode.postMessage({ type: "compareSideBySide" });
        });
      }

      window.addEventListener("mc-review-focus", function (e) {
        var id = e.detail && e.detail.nodeId;
        if (!list) return;
        list.querySelectorAll(".mc-change-row-wrap").forEach(function (wrap) {
          wrap.classList.toggle(
            "list-focus",
            Boolean(id && wrap.querySelector('[data-node-id="' + id + '"]')),
          );
        });
      });
    })();
  `;
}

function changeRowHtml(c: DiagramChangeItem, hidden: boolean): string {
    const hiddenClass = hidden ? " hidden" : "";
    return (
        `<div class="mc-change-row-wrap${hiddenClass}" data-kind="${c.kind}">` +
        `<button type="button" class="mc-change-row ${c.kind}" data-node-id="${escapeHtml(c.nodeId)}" data-kind="${c.kind}" data-label="${escapeHtml(c.label)}" title="${escapeHtml(c.label)}">` +
        `<span class="mc-status-dot ${c.kind}" aria-hidden="true"></span>` +
        `<span class="mc-change-label">${escapeHtml(c.label)}</span></button>` +
        `<button type="button" class="mc-view-code-link" data-action="view-change-code" data-node-id="${escapeHtml(c.nodeId)}" data-kind="${c.kind}" data-label="${escapeHtml(c.label)}" title="Open diff at this change">View code</button>` +
        `</div>`
    );
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

import {
    DiagramChangeItem,
    DiagramDiffCounts,
} from "./diagramDiffHighlighter";
import { MERMAID_PREVIEW_THEMES } from "../../../webview/src/themes/previewThemes";
import { getThemeColors } from "../../../webview/src/themes/themeConfig";

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

  /* Theme pill trigger — original review chrome button */
  .mc-theme-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  button.mc-pill.mc-pill-theme {
    cursor: pointer;
  }
  .mc-pill-theme .mc-theme-pill-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Dropdown list — matches webview ThemeSelector.svelte */
  .mc-theme-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: auto;
    min-width: 160px;
    z-index: 1000;
    background: var(--dropdown-bg, var(--vscode-editorWidget-background, #252526));
    border: 1px solid var(--dropdown-border, var(--mc-pill-border));
    border-radius: 4px;
    box-shadow: 0 4px 14px 0 #00000024;
    overflow: hidden;
    font-family: var(--vscode-font-family);
    font-size: 12px;
  }
  .mc-theme-picker.is-open .mc-theme-dropdown {
    display: block;
  }
  .mc-theme-dropdown-title {
    padding: 8px 14px;
    color: var(--dropdown-text, var(--mc-pill-text));
    font-size: 12px;
    font-weight: normal;
    border-bottom: 1px solid var(--dropdown-border, var(--mc-pill-border));
    background: none;
  }
  .mc-theme-dropdown-item {
    appearance: none;
    display: block;
    width: 100%;
    padding: 8px 14px;
    border: none;
    background: none;
    color: var(--dropdown-text, var(--mc-pill-text));
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .mc-theme-dropdown-item:hover {
    background: var(--dropdown-hover-bg, var(--vscode-list-hoverBackground));
  }
  .mc-theme-dropdown-item.is-selected {
    background: var(--dropdown-selected-bg, var(--vscode-button-background));
    color: var(--dropdown-selected-text, var(--vscode-button-foreground, #fff));
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
    transition: max-height 180ms ease, opacity 150ms ease, border-color 150ms ease;
  }
  .mc-changes-panel.collapsed {
    max-height: 0;
    opacity: 0;
    border-color: transparent;
    pointer-events: none;
    box-shadow: none;
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
    min-height: 36px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: border-color 100ms ease, background 100ms ease;
  }
  .mc-change-row-wrap.list-focus {
    border-color: var(--vscode-focusBorder);
    background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 40%, var(--mc-pill-bg));
  }

  button.mc-change-row {
    appearance: none;
    display: flex;
    width: 100%;
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
    right: 10px;
    bottom: 10px;
    top: auto;
    left: auto;
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
  .mermaid-review-diagram-dimmed {
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

/** Same dropdown color logic as ThemeSelector.svelte + themeConfig. */
function themePickerAppearance(diagramTheme: string, vscodeThemeName = "Default Light+"): {
    modeClass: string;
    style: string;
} {
    const isDarkDiagram = diagramTheme.includes("dark") || diagramTheme === "dark";
    const vscodeThemeColors = getThemeColors(vscodeThemeName);
    if (isDarkDiagram) {
        const text = vscodeThemeColors.isDark ? "#cccccc" : "#333333";
        const selectedText = vscodeThemeColors.isDark ? "#ffffff" : "#333333";
        return {
            modeClass: "mc-theme-diagram-dark",
            style:
                `--dropdown-bg:${vscodeThemeColors.modalBackground};` +
                `--dropdown-border:${vscodeThemeColors.secondaryBackground};` +
                `--dropdown-text:${text};` +
                `--dropdown-hover-bg:${vscodeThemeColors.secondaryBackground};` +
                `--dropdown-selected-bg:${vscodeThemeColors.accentColor};` +
                `--dropdown-selected-text:${selectedText};`,
        };
    }
    return {
        modeClass: "mc-theme-diagram-light",
        style:
            "--dropdown-bg:#ffffff;" +
            "--dropdown-border:#c8c8c8;" +
            "--dropdown-text:#333333;" +
            "--dropdown-hover-bg:#e8e8e8;" +
            "--dropdown-selected-bg:#0060C0;" +
            "--dropdown-selected-text:#ffffff;",
    };
}

function themeLabelForKey(themeKey: string): string {
    const match = MERMAID_PREVIEW_THEMES.find((t) => t.key === themeKey);
    return match?.name ?? themeKey;
}

export function renderThemeSelect(currentTheme: string, vscodeThemeName?: string): string {
    const { modeClass, style } = themePickerAppearance(currentTheme, vscodeThemeName);
    const label = themeLabelForKey(currentTheme);
    const items = MERMAID_PREVIEW_THEMES.map((t) => {
        const selected = t.key === currentTheme ? " is-selected" : "";
        return (
            `<button type="button" class="mc-theme-dropdown-item${selected}" data-action="theme-pick" ` +
            `data-theme-key="${escapeHtml(t.key)}">${escapeHtml(t.name)}</button>`
        );
    }).join("");
    return (
        `<div class="mc-theme-picker mc-review-chrome ${modeClass}" data-current-theme="${escapeHtml(currentTheme)}" style="${style}">` +
        `<button type="button" class="mc-pill mc-pill-theme mc-review-chrome" data-action="theme-toggle" ` +
        `aria-label="Diagram theme" aria-haspopup="listbox" title="Diagram theme">` +
        `<span class="mc-status-dot theme" aria-hidden="true"></span>` +
        `<span class="mc-pill-label mc-theme-pill-label">${escapeHtml(label)}</span></button>` +
        `<div class="mc-theme-dropdown" role="listbox" aria-label="Diagram theme">` +
        `<div class="mc-theme-dropdown-title">Themes</div>${items}</div></div>`
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

export function renderMetaChips(opts: { reviewRef?: string }): string {
    if (!opts.reviewRef?.trim()) {
        return "";
    }
    const ref = escapeHtml(opts.reviewRef.trim());
    return (
        `<span class="mc-pill mc-pill-branch mc-review-chrome" title="Review reference">` +
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

    return `<nav id="mc-review-changes-panel" class="mc-changes-panel mc-review-chrome collapsed" aria-label="Diagram changes">
      <div class="mc-changes-scroll">${sections.join("")}${expandAll}</div>
    </nav>`;
}

/** Live-update payload for the review header chips + changes list (postMessage from extension). */
export function buildReviewChromeLiveUpdate(
    counts: DiagramDiffCounts,
    changes: DiagramChangeItem[],
): { summaryHtml: string; changesHtml: string } {
    return {
        summaryHtml: renderSummaryChips(counts),
        changesHtml: renderChangesList(changes),
    };
}

export function reviewChromeScript(_nonce: string): string {
    return /* js */ `
    (function () {
      var w = window;
      var vscode = w.__mermaidVscodeApi;
      if (!vscode && typeof acquireVsCodeApi === "function") {
        try {
          vscode = acquireVsCodeApi();
          w.__mermaidVscodeApi = vscode;
        } catch (err) {
          console.warn("[Mermaid Review] VS Code API already acquired", err);
          vscode = w.__mermaidVscodeApi;
        }
      }
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
          list.classList.toggle("collapsed", activeFilter === null);
          list.setAttribute("aria-hidden", activeFilter === null ? "true" : "false");
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

      function bindFilterPills() {
        document.querySelectorAll("button.mc-pill[data-filter]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            setFilter(btn.getAttribute("data-filter"));
          });
        });
      }

      function bindChangeRows() {
        list = document.getElementById("mc-review-changes-panel") || document.querySelector(".mc-changes-panel");
        if (!list) return;
        list.querySelectorAll("button.mc-change-row[data-node-id]").forEach(function (row) {
          row.addEventListener("click", function () {
            var nodeId = row.getAttribute("data-node-id");
            var kind = row.getAttribute("data-kind") || "";
            focusDiagramNode(nodeId, kind);
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

      bindFilterPills();

      var themePicker = document.querySelector(".mc-theme-picker");
      if (themePicker) {
        var themeTrigger = themePicker.querySelector("[data-action=theme-toggle]");
        var themePillLabel = themePicker.querySelector(".mc-theme-pill-label");
        var closeThemePicker = function () {
          themePicker.classList.remove("is-open");
        };
        var openThemePicker = function () {
          themePicker.classList.add("is-open");
        };
        if (themeTrigger) {
          themeTrigger.addEventListener("click", function (ev) {
            ev.stopPropagation();
            if (themePicker.classList.contains("is-open")) {
              closeThemePicker();
            } else {
              openThemePicker();
            }
          });
        }
        themePicker.querySelectorAll("[data-action=theme-pick]").forEach(function (btn) {
          btn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            var key = btn.getAttribute("data-theme-key");
            if (!key) return;
            themePicker.setAttribute("data-current-theme", key);
            if (themePillLabel) {
              themePillLabel.textContent = btn.textContent.trim();
            }
            themePicker.querySelectorAll(".mc-theme-dropdown-item").forEach(function (item) {
              item.classList.toggle("is-selected", item.getAttribute("data-theme-key") === key);
            });
            closeThemePicker();
            vscode.postMessage({ type: "setTheme", theme: key });
          });
        });
        document.addEventListener("click", function (ev) {
          if (!themePicker.classList.contains("is-open")) return;
          if (!ev.target.closest(".mc-theme-picker")) {
            closeThemePicker();
          }
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

      function activatePhasePill(phase) {
        document.querySelectorAll(".mc-segmented-pill button[data-phase]").forEach(function (btn) {
          btn.classList.toggle("active", btn.getAttribute("data-phase") === phase);
        });
      }

      function focusDiagramNode(nodeId, kind) {
        if (!nodeId) return;
        if (kind === "removed") {
          var beforeBtn = document.querySelector('.mc-segmented-pill button[data-phase="before"]');
          if (beforeBtn && !beforeBtn.classList.contains("active")) {
            activatePhasePill("before");
            vscode.postMessage({ type: "switchPhase", phase: "before" });
            setTimeout(function () {
              vscode.postMessage({ type: "focusChange", nodeId: nodeId });
            }, 420);
            return;
          }
        }
        vscode.postMessage({ type: "focusChange", nodeId: nodeId });
      }

      bindChangeRows();

      window.addEventListener("message", function (event) {
        var msg = event && event.data;
        if (!msg || msg.type !== "updateReviewChrome") return;
        var summaryHost = document.getElementById("mc-review-summary-chips");
        if (summaryHost && msg.summaryHtml) {
          summaryHost.innerHTML = msg.summaryHtml;
          bindFilterPills();
          activeFilter = null;
          list = document.getElementById("mc-review-changes-panel") || document.querySelector(".mc-changes-panel");
          if (list) {
            list.classList.add("collapsed");
            list.setAttribute("aria-hidden", "true");
          }
          w.dispatchEvent(new CustomEvent("mc-review-filter", { detail: { filter: null } }));
        }
        if (msg.changesHtml) {
          var changesHost = document.getElementById("mc-review-changes-panel");
          if (changesHost) {
            changesHost.outerHTML = msg.changesHtml;
          }
          list = document.getElementById("mc-review-changes-panel") || document.querySelector(".mc-changes-panel");
          bindChangeRows();
          if (list) {
            list.classList.add("collapsed");
            list.setAttribute("aria-hidden", "true");
          }
          activeFilter = null;
        }
      });

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
          wrap.classList.toggle("list-focus", Boolean(id && wrap.getAttribute("data-node-id") === id));
        });
      });
    })();
  `;
}

function changeRowHtml(c: DiagramChangeItem, hidden: boolean): string {
    const hiddenClass = hidden ? " hidden" : "";
    return (
        `<div class="mc-change-row-wrap${hiddenClass}" data-kind="${c.kind}" data-node-id="${escapeHtml(c.nodeId)}">` +
        `<button type="button" class="mc-change-row ${c.kind}" data-node-id="${escapeHtml(c.nodeId)}" data-kind="${c.kind}" data-label="${escapeHtml(c.label)}" title="${escapeHtml(c.label)}">` +
        `<span class="mc-status-dot ${c.kind}" aria-hidden="true"></span>` +
        `<span class="mc-change-label">${escapeHtml(c.label)}</span></button>` +
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

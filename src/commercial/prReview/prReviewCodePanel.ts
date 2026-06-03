import * as vscode from "vscode";
import { DiagramChangeKind, findNodeLineRanges } from "./diagramNodeDiff";

export interface PrReviewCodeFocus {
    nodeId: string;
    kind: DiagramChangeKind;
    changeLabel?: string;
}

let codePanel: vscode.WebviewPanel | undefined;
let boundPreview: vscode.WebviewPanel | undefined;
let layoutApplied = false;
const previewDisposeHooked = new WeakSet<vscode.WebviewPanel>();

export function disposePrReviewCodePanel(): void {
    codePanel?.dispose();
    codePanel = undefined;
    boundPreview = undefined;
    layoutApplied = false;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderLineColumn(
    lines: string[],
    highlightLines: Set<number>,
    scrollToLine: number | undefined,
): string {
    const rows = lines.map((text, i) => {
        const classes = ["code-line"];
        if (highlightLines.has(i)) {
            classes.push("focus");
        }
        if (scrollToLine === i) {
            classes.push("scroll-target");
        }
        const num = String(i + 1).padStart(3, " ");
        return `<div class="${classes.join(" ")}" data-line="${i}">` +
            `<span class="ln">${num}</span>` +
            `<span class="txt">${escapeHtml(text)}</span></div>`;
    }).join("");
    return `<div class="code-col-body">${rows}</div>`;
}

function buildHighlightSets(
    oldText: string,
    newText: string,
    focus?: PrReviewCodeFocus,
): { before: Set<number>; after: Set<number>; scrollBefore?: number; scrollAfter?: number } {
    if (!focus?.nodeId) {
        return { before: new Set(), after: new Set() };
    }
    const beforeLines = findNodeLineRanges(oldText, focus.nodeId);
    const afterLines = findNodeLineRanges(newText, focus.nodeId);
    const before = new Set<number>();
    const after = new Set<number>();
    if (focus.kind === "removed" || focus.kind === "modified") {
        for (const l of beforeLines) {
            before.add(l);
        }
    }
    if (focus.kind === "added" || focus.kind === "modified") {
        for (const l of afterLines) {
            after.add(l);
        }
    }
    return {
        before,
        after,
        scrollBefore: beforeLines[0],
        scrollAfter: afterLines[0],
    };
}

function renderHtml(
    oldText: string,
    newText: string,
    fileName: string,
    focus?: PrReviewCodeFocus,
): string {
    const { before, after, scrollBefore, scrollAfter } = buildHighlightSets(oldText, newText, focus);
    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);
    const subtitle = focus?.changeLabel
        ? escapeHtml(focus.changeLabel)
        : "Full diagram source";

    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  :root { color-scheme: light dark; }
  html, body {
    margin: 0;
    height: 100%;
    overflow: hidden;
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    background: var(--vscode-editor-background);
  }
  body { display: flex; flex-direction: column; }
  header {
    flex-shrink: 0;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-family: var(--vscode-font-family);
    font-size: 11px;
  }
  header .title { font-weight: 600; font-size: 12px; }
  header .sub { color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .code-split {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
  }
  .code-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-right: 1px solid var(--vscode-panel-border);
  }
  .code-col:last-child { border-right: none; }
  .code-col-hdr {
    flex-shrink: 0;
    padding: 6px 10px;
    font-family: var(--vscode-font-family);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .code-col-hdr.after { color: var(--vscode-gitDecoration-addedResourceForeground); }
  .code-col-hdr.before { color: var(--vscode-descriptionForeground); }
  .code-col-body {
    flex: 1;
    overflow: auto;
    padding: 4px 0;
  }
  .code-line {
    display: flex;
    gap: 0;
    line-height: 1.55;
    white-space: pre;
  }
  .code-line .ln {
    flex-shrink: 0;
    width: 36px;
    text-align: right;
    padding: 0 8px 0 4px;
    color: var(--vscode-editorLineNumber-foreground);
    user-select: none;
  }
  .code-line .txt {
    flex: 1;
    padding-right: 12px;
    white-space: pre;
    overflow-x: auto;
  }
  .code-line.focus {
    background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.2));
    outline: 1px solid var(--vscode-editor-findMatchBorder, rgba(234, 92, 0, 0.45));
    outline-offset: -1px;
  }
</style>
</head>
<body>
  <header>
    <div class="title">${escapeHtml(fileName)} · Diff code</div>
    <div class="sub">${subtitle}</div>
  </header>
  <div class="code-split">
    <section class="code-col" aria-label="Before">
      <div class="code-col-hdr before">Before</div>
      ${renderLineColumn(oldLines, before, scrollBefore)}
    </section>
    <section class="code-col" aria-label="After">
      <div class="code-col-hdr after">After</div>
      ${renderLineColumn(newLines, after, scrollAfter)}
    </section>
  </div>
  <script>
    (function () {
      var target = document.querySelector(".scroll-target");
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    })();
  </script>
</body>
</html>`;
}

function applySplitLayout(): void {
    if (layoutApplied) {
        return;
    }
    layoutApplied = true;
    setTimeout(() => {
        void vscode.commands.executeCommand("vscode.setEditorLayout", {
            orientation: 0,
            groups: [{ size: 0.55 }, { size: 0.45 }],
        });
    }, 120);
}

/**
 * Opens (or updates) a code diff webview in a tab beside the diagram preview.
 */
export function openPrReviewCodeBeside(
    previewPanel: vscode.WebviewPanel,
    oldDiagramText: string,
    newDiagramText: string,
    fileName: string,
    focus?: PrReviewCodeFocus,
): void {
    const panelTitle = focus?.changeLabel ? `Code · ${focus.changeLabel}` : "Diff code";
    const html = renderHtml(oldDiagramText, newDiagramText, fileName, focus);

    if (codePanel && boundPreview === previewPanel) {
        codePanel.title = panelTitle;
        codePanel.webview.html = html;
        codePanel.reveal(vscode.ViewColumn.Beside, false);
        previewPanel.reveal(previewPanel.viewColumn, true);
        return;
    }

    if (codePanel) {
        codePanel.dispose();
        codePanel = undefined;
        layoutApplied = false;
    }

    previewPanel.reveal(previewPanel.viewColumn, true);

    codePanel = vscode.window.createWebviewPanel(
        "mermaidPrReviewCode",
        panelTitle,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
    );
    boundPreview = previewPanel;
    codePanel.webview.html = html;

    codePanel.onDidDispose(() => {
        codePanel = undefined;
        layoutApplied = false;
    });

    if (!previewDisposeHooked.has(previewPanel)) {
        previewDisposeHooked.add(previewPanel);
        previewPanel.onDidDispose(() => disposePrReviewCodePanel());
    }

    applySplitLayout();
}

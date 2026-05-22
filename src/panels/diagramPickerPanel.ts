import * as vscode from "vscode";
import { createWebviewNonce } from "../templates/webviewHtmlHelpers";
import type { DiagramSuggestion } from "../services/diagramDetector";

interface DiagramTypeEntry {
  type: string;
  label: string;
  description: string;
  /** Minimal valid Mermaid code rendered as a thumbnail. */
  example: string;
}

const DIAGRAM_ENTRIES: DiagramTypeEntry[] = [
  {
    type: "flowchart",
    label: "Flowchart",
    description: "Control flow, process steps",
    example: `flowchart LR
  A[Start] --> B{Check}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D`,
  },
  {
    type: "sequenceDiagram",
    label: "Sequence",
    description: "Function calls, message passing",
    example: `sequenceDiagram
  participant A as Client
  participant B as Server
  A->>B: Request
  B-->>A: Response`,
  },
  {
    type: "classDiagram",
    label: "Class",
    description: "Classes, interfaces, inheritance",
    example: `classDiagram
  class Animal {
    +name: string
    +speak()
  }
  class Dog
  Animal <|-- Dog`,
  },
  {
    type: "erDiagram",
    label: "ER",
    description: "Database tables, schemas",
    example: `erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ITEM : contains`,
  },
  {
    type: "stateDiagram-v2",
    label: "State",
    description: "State machines, transitions",
    example: `stateDiagram-v2
  [*] --> Idle
  Idle --> Active: start
  Active --> Idle: stop
  Active --> [*]: done`,
  },
  {
    type: "gantt",
    label: "Gantt",
    description: "Project tasks, timelines",
    example: `gantt
  dateFormat YYYY-MM-DD
  section Build
  Design :a1, 2024-01-01, 5d
  Develop :a2, after a1, 7d
  Test    :a3, after a2, 3d`,
  },
  {
    type: "mindmap",
    label: "Mindmap",
    description: "Concept hierarchies",
    example: `mindmap
  root((Project))
    Frontend
      React
      CSS
    Backend
      API
      Database`,
  },
  {
    type: "architecture-beta",
    label: "Architecture",
    description: "System architecture, services",
    example: `architecture-beta
  group api(cloud)[API]
    service server(server)[Server] in api
    service db(database)[DB] in api
    server:R --> L:db`,
  },
  {
    type: "pie",
    label: "Pie",
    description: "Proportional data",
    example: `pie title Distribution
  "Frontend" : 40
  "Backend" : 35
  "DevOps" : 25`,
  },
  {
    type: "gitGraph",
    label: "Git Graph",
    description: "Branch/merge workflows",
    example: `gitGraph
  commit
  branch feature
  commit
  commit
  checkout main
  merge feature
  commit`,
  },
];

/**
 * Opens a webview panel that renders diagram-type thumbnails and lets the user
 * pick one. Resolves with the Mermaid diagram type string, or `undefined` if
 * the user dismisses the panel.
 */
export function showDiagramPicker(
  extensionUri: vscode.Uri,
  suggestion: DiagramSuggestion
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "mermaidDiagramPicker",
      "Choose diagram type",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: false,
      }
    );

    let resolved = false;
    function finish(value: string | undefined) {
      if (resolved) return;
      resolved = true;
      resolve(value);
      panel.dispose();
    }

    panel.onDidDispose(() => finish(undefined));
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "pick") {
        finish(msg.diagramType);
      } else if (msg.type === "cancel") {
        finish(undefined);
      }
    });

    panel.webview.html = getPickerHtml(panel.webview, extensionUri, suggestion);
  });
}

function getPickerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  suggestion: DiagramSuggestion
): string {
  const nonce = createWebviewNonce();
  const csp = webview.cspSource;

  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "recursive-latin-full-normal.woff2")
  );
  const mermaidUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist-sidebar", "mermaid.js")
  );

  const recommendedType = suggestion.type;
  const sortedEntries = [...DIAGRAM_ENTRIES].sort((a, b) => {
    if (a.type === recommendedType) return -1;
    if (b.type === recommendedType) return 1;
    return 0;
  });

  const rowsHtml = sortedEntries.map((entry, i) => {
    const isRecommended = entry.type === recommendedType;
    const isLast = i === sortedEntries.length - 1;
    const needsSep = !isRecommended && !isLast && sortedEntries[i + 1]?.type !== recommendedType;
    return `
      <button class="row${isRecommended ? " recommended" : ""}" data-type="${entry.type}">
        <div class="row-thumb${isRecommended ? " row-thumb-rec" : ""}" id="thumb-${entry.type}">
          <span class="thumb-loading"></span>
        </div>
        <div class="row-info${isRecommended ? " row-info-rec" : ""}">
          <div class="row-top${isRecommended ? " row-top-rec" : ""}">
            <span class="row-label${isRecommended ? " row-label-rec" : ""}">${entry.label}</span>
            ${isRecommended ? `<span class="badge">Recommended</span>` : ""}
          </div>
          <span class="row-desc${isRecommended ? " row-desc-rec" : ""}">${entry.description}</span>
        </div>
        <svg class="row-arrow${isRecommended ? " row-arrow-rec" : ""}" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M9 5L16 12L9 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>${needsSep ? `<div class="separator"></div>` : ""}`;
  }).join("");

  // Build a JS object with all diagram examples so thumbnails render after the
  // mermaid bundle loads (a single script block, no per-card scripts).
  const examplesJs = JSON.stringify(
    Object.fromEntries(DIAGRAM_ENTRIES.map((e) => [e.type, e.example]))
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; img-src ${csp} https: data:; font-src ${csp}; script-src 'nonce-${nonce}' ${csp}; connect-src https:;">
<style nonce="${nonce}">
  @font-face {
    font-family: "Recursive";
    src: url("${fontUrl}") format("woff2");
    font-weight: 300 900;
    font-style: normal;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Recursive", var(--vscode-font-family), system-ui, sans-serif;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 28px 28px;
    line-height: 1.5;
    max-width: 560px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .header {
    margin-bottom: 16px;
  }
  .header-title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.15px;
    color: #e6e6e6;
    margin-bottom: 2px;
  }
  .header-sub {
    font-size: 12px;
    color: #999;
    font-weight: 400;
  }
  .header-suggestion {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-textLink-foreground, #3794ff);
    opacity: 0.8;
  }
  .header-suggestion::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--vscode-textLink-foreground, #3794ff);
    opacity: 0.6;
  }

  /* ── List ── */
  .list {
    display: flex;
    flex-direction: column;
  }

  /* ── Row item ── */
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    color: inherit;
    padding: 6px 4px;
    transition: background 0.12s;
    width: 100%;
  }
  .row:hover {
    background: rgba(255,255,255,0.04);
  }
  .row:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
    border-radius: 4px;
  }
  .row.recommended {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(55,148,255,0.2);
    border-radius: 8px;
    padding: 12px 8px;
    gap: 20px;
    margin-bottom: 2px;
  }
  .row.recommended:hover {
    background: rgba(255,255,255,0.1);
  }

  .separator {
    height: 1px;
    background: rgba(255,255,255,0.06);
    width: 100%;
  }

  .badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--vscode-textLink-foreground, #3794ff);
    background: rgba(55,148,255,0.15);
    padding: 2px 8px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .row-thumb {
    flex-shrink: 0;
    width: 44px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(255,255,255,0.04);
  }
  .row-thumb-rec {
    border-radius: 6px;
  }
  .row-thumb svg {
    max-width: 40px;
    max-height: 30px;
    height: auto;
  }
  .thumb-loading {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255,255,255,0.1);
    border-top-color: var(--vscode-textLink-foreground, #3794ff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.4;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .row-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .row-info-rec { gap: 4px; }
  .row-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row-top-rec { gap: 8px; }
  .row-label {
    font-size: 12px;
    font-weight: 500;
    color: #dedede;
  }
  .row-label-rec {
    font-size: 15px;
    font-weight: 600;
    color: #ffffff;
  }
  .row-desc {
    font-size: 10px;
    color: #999;
    font-weight: 400;
  }
  .row-desc-rec {
    font-size: 12px;
    color: #b3b3b3;
  }
  .row-arrow {
    flex-shrink: 0;
    opacity: 0.15;
    transition: opacity 0.12s;
  }
  .row-arrow-rec { opacity: 0.35; }
  .row:hover .row-arrow { opacity: 0.5; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-title">Choose diagram type</div>
    <div class="header-sub">Select a type to generate from your code</div>
    <div class="header-suggestion">${suggestion.label} — ${suggestion.reason}</div>
  </div>

  <div class="list">
    ${rowsHtml}
  </div>

  <script nonce="${nonce}" src="${mermaidUrl}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.row').forEach(function(row) {
      row.addEventListener('click', function() {
        vscode.postMessage({ type: 'pick', diagramType: row.dataset.type });
      });
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        vscode.postMessage({ type: 'cancel' });
      }
    });

    (async function renderThumbnails() {
      if (typeof sidebarMermaid === 'undefined') return;
      var examples = ${examplesJs};
      var types = Object.keys(examples);
      for (var i = 0; i < types.length; i++) {
        var t = types[i];
        var el = document.getElementById('thumb-' + t);
        if (!el) continue;
        try {
          var svg = await sidebarMermaid.render(examples[t], 'svg-' + t + '-' + i);
          el.innerHTML = svg || '';
        } catch (e) {
          el.innerHTML = '';
        }
      }
    })();
  </script>
</body>
</html>`;
}

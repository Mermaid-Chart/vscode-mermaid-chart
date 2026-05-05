import * as vscode from "vscode";
import * as path from "path";

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
): string {
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "out", "svelte", "bundle.js"))
  );
  const fontUrl = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "media", "recursive-latin-full-normal.woff2"))
  );

  // Make sure the panel retains state when hidden
  // panel.onDidChangeViewState((e) => {
  //   // Rerender content when panel becomes visible again
  //   if (e.webviewPanel.visible) {
  //     panel.webview.postMessage({
  //       type: "update",
  //       content: initialContent,
  //       currentTheme: currentTheme,
  //       isFileChange: false,
  //       validateOnly: validateOnly,
  //     });
  //   }
  // });
  
  // Ensure panel doesn't close automatically
  panel.onDidDispose(() => {
    // Optional cleanup code here
  });
  
  const initialHighlightJson = highlightAddedNodeIds && highlightAddedNodeIds.length > 0
    ? JSON.stringify(highlightAddedNodeIds)
    : "[]";

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
          height: 100vh;
        }
        body {
          font-family: "Recursive", serif;
          padding: 0px;
        }
        /* Tint nodes added by Mermaid Sync. SVG outline is unreliable on
           shape elements, so we tint the fill and thicken the stroke
           directly — using VS Code's git-added theme colors so it follows
           light/dark mode automatically. */
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
        .mermaid-pr-review-added .label,
        .mermaid-pr-review-added text {
          font-weight: 600;
        }
        @keyframes mermaid-pr-review-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      </style>
    </head>
    <body>
      <div
        id="app"
        data-initial-content="${encodeURIComponent(initialContent)}"
        data-current-theme="${encodeURIComponent(currentTheme)}"
        data-max-zoom="${encodeURIComponent(String(options?.maxZoom ?? 5))}"
        data-max-char-length="${encodeURIComponent(String(options?.maxCharLength ?? 90000))}"
        data-max-edges="${encodeURIComponent(String(options?.maxEdges ?? 1000))}"
      ></div>
      <script>
        // PR-review node highlighting. Watches the SVG that the Svelte bundle
        // renders and tags any <g class="node"> whose Mermaid id encodes one of
        // the bot-added node ids. Re-applies on Mermaid re-render and on
        // postMessage so the outline survives theme switches.
        (function () {
          let added = ${initialHighlightJson};
          const HIGHLIGHT_CLASS = "mermaid-pr-review-added";

          function nodeMatches(g) {
            const id = g.getAttribute("id") || "";
            // Mermaid flowchart ids look like "flowchart-NODEID-N" (older) or
            // "flowchart-NODEID-N-N" (newer). State / class diagrams reuse the
            // pattern. Matching the id segment between dashes covers all of
            // them without parsing the diagram type.
            return added.some(function (nodeId) {
              if (!nodeId) return false;
              const parts = id.split("-");
              return parts.indexOf(nodeId) !== -1;
            });
          }

          // Auto-zoom-to-change runs once per render: when we tag the
          // first matching node, scroll it into view so the user lands on
          // the change instead of having to hunt for it. We don't repeat
          // it on subsequent re-applies, otherwise pan/zoom by the user
          // would keep getting reset.
          let hasZoomed = false;

          function applyHighlight() {
            if (!added.length) return;
            let firstHighlighted = null;
            document.querySelectorAll("g.node, g.classGroup, g.stateGroup").forEach(function (g) {
              const matched = nodeMatches(g);
              g.classList.toggle(HIGHLIGHT_CLASS, matched);
              if (matched && !firstHighlighted) {
                firstHighlighted = g;
              }
            });
            if (firstHighlighted && !hasZoomed) {
              // Defer to the next paint so the highlight class has applied
              // and any layout reflow has settled before we measure.
              requestAnimationFrame(function () {
                try {
                  firstHighlighted.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "center",
                  });
                  hasZoomed = true;
                } catch (e) {
                  // Older Chromium in some VS Code builds dislikes the
                  // smooth-scroll arg; fall back to the boolean form.
                  try { firstHighlighted.scrollIntoView(false); hasZoomed = true; } catch { /* ignore */ }
                }
              });
            }
          }

          const observer = new MutationObserver(function () {
            applyHighlight();
          });
          observer.observe(document.body, { childList: true, subtree: true });

          window.addEventListener("message", function (event) {
            const msg = event && event.data;
            if (!msg || msg.type !== "highlightNodes") return;
            added = Array.isArray(msg.addedNodeIds) ? msg.addedNodeIds : [];
            // A new set of node ids resets the once-only zoom: this is a
            // fresh review surface, the user expects to land on the new
            // change again.
            hasZoomed = false;
            applyHighlight();
          });

          applyHighlight();
        })();
      </script>
    </body>
    </html>
  `;
}

// // Add this helper function to create a persistent panel
// export function createPersistentPanel(context: vscode.ExtensionContext, viewType: string, title: string): vscode.WebviewPanel {
//   // Check if we already have a panel stored in context
//   const existingPanel = context.globalState.get<string>('mermaidPreviewPanelId');
  
//   // Create options for a persistent panel
//   const panelOptions = {
//     enableScripts: true,
//     retainContextWhenHidden: true,  // Important to keep panel state when not visible
//     localResourceRoots: [vscode.Uri.file(context.extensionPath)]
//   };
  
//   // Create the panel
//   const panel = vscode.window.createWebviewPanel(
//     viewType,
//     title,
//     vscode.ViewColumn.Beside,
//     panelOptions
//   );
  
//   // Store panel ID
//   context.globalState.update('mermaidPreviewPanelId', panel.title);
  
//   return panel;
// }
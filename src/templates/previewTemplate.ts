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
  }
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
    </body>
    </html>
  `;
}

import * as vscode from "vscode";

/**
 * Settings webview body. Only the anonymous usage analytics toggle lives here;
 * everything else is managed through VS Code's own settings UI.
 */
export function generateSettingsWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "recursive-latin-full-normal.woff2")
  );
  const settingsIconDark = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "icons", "settings-dark.svg")
  );
  const settingsIconLight = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "icons", "settings-light.svg")
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid Settings</title>
    <style>
    @font-face {
      font-family: "Recursive";
      src: url("${fontUrl}") format("woff2");
      font-weight: 300 900;
      font-style: normal;
    }

    :root {
      --vscode-bg: var(--vscode-editor-background);
      --pink-color: #E0095F;
      --text-color: #8585A4;
    }

    body {
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
      background-color: var(--vscode-bg);
      font-family: "Recursive", serif;
      color: var(--vscode-editor-foreground);
      font-size: 13px;
      line-height: 18px;
    }

    .vscode-light .dark-icon,
    .vscode-dark .light-icon,
    .vscode-high-contrast .light-icon {
      display: none;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      font-weight: 600;
    }

    .glyph {
      width: 16px;
      height: 16px;
    }

    .setting-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
    }

    .setting-label {
      margin: 0;
      font-size: 13px;
    }

    .setting-description {
      margin: 2px 0 0 0;
      color: var(--text-color);
      font-size: 11px;
      line-height: 15px;
    }

    .toggle {
      position: relative;
      flex: 0 0 auto;
      width: 32px;
      height: 16px;
      margin-top: 2px;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: #4A4A55;
      cursor: pointer;
    }

    .toggle::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #E9E9EF;
      transition: left 120ms ease-in-out;
    }

    .toggle[aria-checked="true"] {
      background: var(--pink-color);
    }

    .toggle[aria-checked="true"]::after {
      left: 18px;
    }

    .settings-link {
      align-self: flex-start;
      margin-top: 8px;
      color: inherit;
      font-size: 12px;
      text-decoration: underline;
      cursor: pointer;
    }

    .arrow {
      font-family: var(--vscode-font-family, system-ui);
      font-size: 14px;
      line-height: 1;
      vertical-align: -1px;
    }
    </style>
</head>
<body>
    <div class="section-header">
        <img class="glyph dark-icon" src="${settingsIconDark}" alt="">
        <img class="glyph light-icon" src="${settingsIconLight}" alt="">
        <span>Settings</span>
    </div>

    <div class="setting-row">
        <div>
            <p class="setting-label">Share usage analytics</p>
            <p id="telemetryDescription" class="setting-description">On by default. Helps us fix bugs.</p>
        </div>
        <button id="telemetryToggle" class="toggle" role="switch" aria-checked="true" aria-label="Share usage analytics"></button>
    </div>

    <a id="openSettings" class="settings-link">Open VS code Mermaid settings <span class="arrow">&#10132;</span></a>

    <script>
        const vscode = acquireVsCodeApi();
        const telemetryToggle = document.getElementById('telemetryToggle');

        telemetryToggle.addEventListener('click', () => {
            vscode.postMessage({
                command: 'setTelemetry',
                enabled: telemetryToggle.getAttribute('aria-checked') !== 'true'
            });
        });

        document.getElementById('openSettings').addEventListener('click', () => {
            vscode.postMessage({ command: 'openSettings' });
        });

        window.addEventListener('message', (event) => {
            if (event.data?.command === 'settingsChanged') {
                telemetryToggle.setAttribute('aria-checked', String(event.data.enableTelemetry));
                document.getElementById('telemetryDescription').textContent =
                    event.data.vscodeTelemetryEnabled
                        ? 'on by default. Helps us fix bugs.'
                        : 'Disabled by VS Code telemetry settings.';
            }
        });

        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}

import * as vscode from "vscode";

/**
 * Feedback-only webview body (intro + form). Mode chrome lives in view/title icons.
 */
export function generateFeedbackWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "recursive-latin-full-normal.woff2")
  );
  const feedbackIconDark = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "icons", "feedback-dark.svg")
  );
  const feedbackIconLight = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "icons", "feedback-light.svg")
  );

  const activities = [
    "Previewing a diagram",
    "Editing a diagram",
    "Exporting a diagram",
    "Previewing a markdown file",
    "Syncing a diagram",
    "Connecting a diagram to Mermaid Chart",
    "Improving a diagram",
    "Repairing a diagram",
    "Creating a diagram",
    "Linking a diagram",
    "Editing in Mermaid Chart",
    "Viewing a diagram",
    "Using AI chat",
    "Generating a diagram from code",
    "Generating a cloud architecture diagram",
    "Generating an ER diagram",
    "Generating a Docker diagram",
    "Generating an ownership diagram",
    "Generating a dependency diagram",
    "Generating a sequence diagram",
    "Generating a C4 architecture diagram",
    "Reviewing Mermaid Sync",
    "Installing AI Skills",
    "Using Mermaid completions",
    "Using pan and zoom",
    "Changing diagram theme",
    "Managing projects and diagrams",
    "Signing in or authentication",
    "Something else",
  ];

  const activityOptions = activities
    .map((activity) => `<option>${activity}</option>`)
    .join("\n                    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Send feedback</title>
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
      padding: 0;
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

    .view {
      display: none;
      padding: 16px;
      box-sizing: border-box;
      flex-direction: column;
    }

    .view.is-active {
      display: flex;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 600;
    }

    .glyph {
      width: 16px;
      height: 16px;
    }

    .feedback-intro {
      margin: 0;
      color: var(--text-color);
      font-size: 12px;
      line-height: 17px;
    }

    .open-form-btn {
      width: 100%;
      margin-top: 16px;
      padding: 10px 0;
      border: none;
      border-radius: 4px;
      background: var(--pink-color);
      color: #FFFFFF;
      font-family: "Recursive", serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .open-form-btn:hover {
      background: #FF257C;
    }

    .field { margin-bottom: 16px; }

    .field-label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 600;
    }

    .field select,
    .field input,
    .field textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      border: 1px solid var(--vscode-input-border, #3D3D46);
      border-radius: 4px;
      outline: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: "Recursive", serif;
      font-size: 12px;
    }

    .field textarea {
      min-height: 72px;
      resize: vertical;
    }

    .send-btn {
      width: 100%;
      padding: 10px 0;
      border: none;
      border-radius: 4px;
      background: #453C6D;
      color: #FFFFFF;
      font-family: "Recursive", serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .send-btn:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .feedback-status {
      min-height: 18px;
      margin: 8px 0 0;
      color: var(--text-color);
      font-size: 11px;
      line-height: 15px;
    }
    </style>
</head>
<body>
    <section id="view-feedback" class="view is-active">
        <div class="section-header">
            <img class="glyph dark-icon" src="${feedbackIconDark}" alt="">
            <img class="glyph light-icon" src="${feedbackIconLight}" alt="">
            <span>Send us feedback</span>
        </div>
        <p class="feedback-intro">Share feedback with the Mermaid team. Takes a minute.</p>
        <button id="openFeedbackForm" class="open-form-btn">Open feedback form</button>
    </section>

    <section id="view-feedback-form" class="view">
        <div class="section-header">
            <img class="glyph dark-icon" src="${feedbackIconDark}" alt="">
            <img class="glyph light-icon" src="${feedbackIconLight}" alt="">
            <span>Send us feedback</span>
        </div>
        <form id="feedbackForm">
            <div class="field">
                <label class="field-label" for="feedbackActivity">What were you doing?</label>
                <select id="feedbackActivity" required>
                    <option value="" selected disabled hidden>Choose an activity</option>
                    ${activityOptions}
                </select>
            </div>
            <div class="field">
                <label class="field-label" for="feedbackFrequency">How often?</label>
                <select id="feedbackFrequency" required>
                    <option value="" selected disabled hidden>Choose a frequency</option>
                    <option>Every time</option>
                    <option>Often</option>
                    <option>Sometimes</option>
                    <option>Only once</option>
                </select>
            </div>
            <div class="field">
                <label class="field-label" for="feedbackDetails">What blocked or bothered you?</label>
                <textarea id="feedbackDetails" required maxlength="4000" placeholder="Tell us what happened"></textarea>
            </div>
            <div class="field">
                <label class="field-label" for="feedbackEmail">Email</label>
                <input id="feedbackEmail" type="email" required maxlength="320" placeholder="you@example.com">
            </div>
            <button id="sendFeedback" class="send-btn" type="submit">Send feedback</button>
            <p id="feedbackStatus" class="feedback-status" role="status" aria-live="polite"></p>
        </form>
    </section>

    <script>
        const vscode = acquireVsCodeApi();
        const feedbackForm = document.getElementById('feedbackForm');
        const sendFeedback = document.getElementById('sendFeedback');
        const feedbackStatus = document.getElementById('feedbackStatus');

        document.getElementById('openFeedbackForm').addEventListener('click', () => {
            document.querySelectorAll('.view').forEach((section) => {
                section.classList.toggle('is-active', section.id === 'view-feedback-form');
            });
        });

        feedbackForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!feedbackForm.reportValidity()) {
                return;
            }
            sendFeedback.disabled = true;
            sendFeedback.textContent = 'Sending...';
            feedbackStatus.textContent = '';
            vscode.postMessage({
                command: 'submitFeedback',
                feedback: {
                    activity: document.getElementById('feedbackActivity').value,
                    frequency: document.getElementById('feedbackFrequency').value,
                    details: document.getElementById('feedbackDetails').value,
                    email: document.getElementById('feedbackEmail').value
                }
            });
        });

        window.addEventListener('message', (event) => {
            if (event.data?.command === 'showFeedbackIntro') {
                document.querySelectorAll('.view').forEach((section) => {
                    section.classList.toggle('is-active', section.id === 'view-feedback');
                });
            }
            if (event.data?.command === 'feedbackResult') {
                feedbackStatus.textContent = event.data.message;
                sendFeedback.disabled = false;
                sendFeedback.textContent = 'Send feedback';
                if (event.data.status === 'success') {
                    feedbackForm.reset();
                }
            }
        });

        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}

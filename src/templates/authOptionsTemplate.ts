import * as vscode from "vscode";

export function generateAuthOptionsContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const logoSrc = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "panel.svg")
  );
  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media","recursive-latin-full-normal.woff2")
  );
  

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MermaidChart Authentication</title>
    <style>
    @font-face {
      font-family: "Recursive";
      src: url("${fontUrl}") format("woff2");
      font-weight: 300 900;
      font-style: normal;
    }

    :root {
      --vscode-bg: var(--vscode-editor-background);
      --vscode-foreground: var(--vscode-editor-foreground);
    }

    body {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--vscode-bg);
      font-family: "Recursive", serif;
      margin: 0;
    }

    .container {
      max-width: 380px; 
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 20px;
    }

    .logo-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
    }

    .logo {
      width: 60px;
      height: 60px;
    }

    .auth-title {
      margin: 0;
      font-size: 20px;
      line-height: 28px;
      font-weight: 420;    
    }

    .description {
      font-weight: 400;
      font-size: 14px;
      line-height: 20px;
      margin: 0;
      text-align: center;
      color: #8585A4;
    }

    .auth-options {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .auth-option {
      border: 1px solid #444;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: transparent;
    }

    .auth-option:hover {
      border-color: #E0095F;
      background: rgba(224, 9, 95, 0.05);
    }

    .option-title {
      font-weight: 600;
      font-size: 16px;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .option-icon {
      width: 20px;
      height: 20px;
      min-width: 20px;
      min-height: 20px;
      flex-shrink: 0;
      display: inline-block;
      color: currentColor;
    }

    .option-description {
      font-size: 14px;
      color: #8585A4;
      margin: 0;
    }

    .manual-token-section {
      display: none;
      width: 100%;
      margin-top: 16px;
    }

    .manual-token-section.show {
      display: block;
    }

    .token-input-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .token-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #444;
      border-radius: 8px;
      background: var(--vscode-bg);
      color: var(--vscode-foreground);
      font-family: "Recursive", serif;
      font-size: 14px;
      box-sizing: border-box;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .token-input:focus {
      outline: none;
      border-color: #E0095F;
    }

    .token-input::placeholder {
      color: #8585A4;
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      width: 100%;
    }

    .btn {
      padding: 12px 24px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: "Recursive", serif;
      flex: 1;
    }

    .btn-primary {
      background: #E0095F;
      color: white;
    }

    .btn-primary:hover {
      background: #c40065;
    }

    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid #444;
    }

    .btn-secondary:hover {
      border-color: #666;
    }

    .back-link {
      margin-top: 16px;
      color: #8585A4;
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
    }

    .back-link:hover {
      color: var(--vscode-foreground);
    }

    .help-text {
      font-size: 12px;
      color: #8585A4;
      text-align: center;
      margin-top: 8px;
    }

    body, .container {
      color: var(--vscode-editor-foreground);
    }

    .vscode-dark body, .vscode-dark .container {
      color: var(--Color-Storm-Grey-300, #BDBCCC);
    }

    .vscode-light body, .vscode-light .container {
      color: var(--Color-Deep-Purple-800, #1E1A2E);
    }

    .vscode-light .auth-option {
      border-color: #ddd;
    }

    .vscode-light .token-input {
      border-color: #ddd;
    }

    .vscode-light .btn-secondary {
      border-color: #ddd;
    }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <img class="logo" src="${logoSrc}" alt="Mermaid Logo">
            <h2 class="auth-title" id="authTitle">Choose Authentication Method</h2>
            <p class="description" id="authDescription">Select how you'd like to sign in to Mermaid Chart</p>
        </div>

        <div class="auth-options">
            <div class="auth-option" id="oauthOption">
                <div class="option-title">
                    <svg class="option-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M18 19.425v1.225q0 .425-.288.713T17 21.65t-.712-.287T16 20.65V17.5q0-.625.438-1.062T17.5 16h3.15q.425 0 .713.288t.287.712t-.287.713t-.713.287H19.4l2.25 2.25q.275.275.275.688t-.275.712q-.3.3-.712.3t-.713-.3zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12q0 .25-.012.55t-.038.55q-.05.425-.35.663t-.75.237q-.4 0-.675-.35t-.225-.75q.05-.25.05-.45V12q0-.5-.063-1t-.187-1h-3.4q.075.5.113 1t.037 1v.538q0 .287-.025.537q-.05.425-.35.675T15.4 14q-.4 0-.687-.325t-.238-.725q.025-.25.025-.475V12q0-.5-.037-1t-.113-1h-4.7q-.075.5-.112 1T9.5 12t.038 1t.112 1H12q.425 0 .713.288T13 15t-.288.713T12 16h-1.9q.3 1.075.775 2.063T12 19.95q.25 0 .5.013t.5-.013q.425-.05.7.213t.275.687q0 .45-.225.75t-.65.35q-.25.025-.55.038T12 22m-7.75-8h3.4q-.075-.5-.112-1T7.5 12t.038-1t.112-1h-3.4q-.125.5-.187 1T4 12t.063 1t.187 1m5.15 5.55q-.45-.85-.788-1.737T8.05 16H5.1q.725 1.275 1.825 2.188T9.4 19.55M5.1 8h2.95q.225-.925.563-1.812T9.4 4.45q-1.375.45-2.475 1.363T5.1 8m5 0h3.8q-.3-1.075-.775-2.062T12 4.05q-.65.9-1.125 1.888T10.1 8m5.85 0h2.95q-.725-1.275-1.825-2.187T14.6 4.45q.45.85.788 1.738T15.95 8"/>
                    </svg>
                   Sign-in (Recommended)
                </div>
                <div class="option-description">Sign in through your browser with OAuth</div>
            </div>

            <div class="auth-option" id="manualOption">
                <div class="option-title">
                    <svg class="option-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M5.588 13.413Q5 12.825 5 12t.588-1.412T7 10t1.413.588T9 12t-.587 1.413T7 14t-1.412-.587M7 18q-2.5 0-4.25-1.75T1 12t1.75-4.25T7 6q1.675 0 3.038.825T12.2 9h8.375q.2 0 .388.075t.337.225l2 2q.15.15.212.325t.063.375t-.063.375t-.212.325l-3.175 3.175q-.125.125-.3.2t-.35.1t-.35-.025t-.325-.175L17.5 15l-1.425 1.075q-.125.1-.275.15t-.3.05t-.313-.05t-.287-.15L13.375 15H12.2q-.8 1.35-2.163 2.175T7 18m0-2q1.4 0 2.463-.85T10.875 13H14l1.45 1.025v.013v-.013L17.5 12.5l1.775 1.375L21.15 12h-.012h.012l-1-1v-.012V11h-9.275q-.35-1.3-1.412-2.15T7 8Q5.35 8 4.175 9.175T3 12t1.175 2.825T7 16"/>
                    </svg>
                    Manual Token
                </div>
                <div class="option-description">Enter your authentication token manually</div>
            </div>
        </div>

        <div class="manual-token-section" id="manualTokenSection">
            <div class="token-input-group">
                <input 
                    type="password" 
                    id="tokenInput" 
                    class="token-input" 
                    placeholder="Paste your authentication token here"
                />
                <div class="help-text">
                    Get your token from: <a href="https://mermaid.ai/app/user/settings" target="_blank">mermaid.ai/app/user/settings</a>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-primary" id="validateTokenBtn">Continue</button>
                </div>
            </div>
        </div>

        <a class="back-link" id="backBtn">← Back</a>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // OAuth option click
        document.getElementById('oauthOption').addEventListener('click', () => {
            vscode.postMessage({ command: 'startOAuthFlow' });
        });

        // Manual token option click  
        document.getElementById('manualOption').addEventListener('click', () => {
            document.getElementById('manualTokenSection').classList.add('show');
            document.querySelector('.auth-options').style.display = 'none';
            // Update title and description for token mode
            document.getElementById('authTitle').textContent = 'Token Authentication';
            document.getElementById('authDescription').style.display = 'none';
        });

        // Validate token
        document.getElementById('validateTokenBtn').addEventListener('click', () => {
            const token = document.getElementById('tokenInput').value.trim();
            if (!token) {
                return;
            }
            vscode.postMessage({ 
                command: 'validateManualToken', 
                token: token 
            });
        });

        // Context-aware back button
        document.getElementById('backBtn').addEventListener('click', () => {
            const manualTokenSection = document.getElementById('manualTokenSection');
            const authOptions = document.querySelector('.auth-options');
            
            // If manual token section is visible, go back to auth options
            if (manualTokenSection.classList.contains('show')) {
                manualTokenSection.classList.remove('show');
                authOptions.style.display = 'flex';
                document.getElementById('tokenInput').value = '';
                // Restore original title and description
                document.getElementById('authTitle').textContent = 'Choose Authentication Method';
                document.getElementById('authDescription').style.display = 'block';
            } else {
                // If on auth options, go back to login
                vscode.postMessage({ command: 'backToLogin' });
            }
        });

        // Enter key support for token input
        document.getElementById('tokenInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('validateTokenBtn').click();
            }
        });
    </script>
</body>
</html>`;
}
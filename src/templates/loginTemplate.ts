import * as vscode from "vscode";

export function generateWebviewContent(
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
    <title>MermaidChart</title>


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

    }

    .container {
      
      max-width: 340px; 
      
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;

    }

    .logo-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
    }

    .logo {
      width: 80px;
      height: 80px  ;
    }
    .welcome-msg{
      margin: 0;
      font-size: 24px;
      line-height: 38px;
      font-weight:420;    
    }

    .description {
      font-weight: 400;
      font-size: 14px;
      line-height: 20px;
      margin: 0;
      text-align: center;
    }

    .bulletin {
      width: 100%;
    }
    
    .login-btn{
       display: flex;
       justify-content: center;
     }

    .bulletin ul {
      color:#8585A4;
      padding-left: 16px;
    }

    .bulletin li {
      margin: 4px 0; 
    }

    .highlight-text {
      margin: 0;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
    }

    button {
      padding: 12px 84px;
      border-radius: 12px;
      background: #E0095F;
      color: white;
      border: none;
      cursor: pointer;
      font-size: 16px;
      font-weight: semi-bold;
      font-family: "Recursive", serif;
      letter-spacing: -2%;
    }

    button:hover {
      background: #c40065;
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

    .vscode-light body, .vscode-light .container .bulletin ul {
      color: #272040;
    }

    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <img class="logo" src="${logoSrc}" alt="Mermaid Logo">
            <h2 class="welcome-msg">Welcome to the 
            <br>
            Official Mermaid Plugin
            </br></h2>
        </div>
        <p class="description">
          Created by the team behind Mermaid open source, this extension offers an advanced and seamless Mermaid editing experience.
        </p>
        <div class="bulletin">
        <p>Sign in to unlock</p>
    <ul style="font-size=14px,font-weight=400px">
        <li>Diagram Sync Seamlessly</li>
        <li>Clickable Diagram References</li>
    </ul>
</div>

        <p class="highlight-text">Join now and supercharge your workflow!</p>
        <div class="login-btn" style="display: flex; flex-direction: column; gap: 12px; width: 100%;"> 
        <button id="signInButton" style="width: 100%;">Sign in with Browser</button>
        <button id="signInWithTokenButton" style="width: 100%; background: transparent; border: 1px solid #E0095F; color: #E0095F;">Sign in with Token</button>
        </div>
        <p style="font-size: 12px; color: #8585A4; text-align: center; margin: 0;">
          Create a token in Settings → Secure tokens for plugins
        </p>
    </div>
     <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('signInButton').addEventListener('click', () => {
            vscode.postMessage({ command: 'signIn' });
        });

        document.getElementById('signInWithTokenButton').addEventListener('click', () => {
            vscode.postMessage({ command: 'signInWithToken' });
        });
    </script>
</body>
</html>`;
}

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
      gap: 20px;

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

    .description-text {
      text-align: center;
      font-size: 14px;
      line-height: 20px;
    }

    .welcome-msg {
      margin: 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 600;
      color: #BEDDE3;
    }

    .login-btn{
       width: 100%;
       display: flex;
       justify-content: center;
     }



    .signing-text {
      margin: 0;
      font-weight: 400;
      font-size: 14px;
      text-align: center;
      line-height: 20px;
    }

    button {
      padding: 12px 84px;
      width: 100%;
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

    /* Theme-specific styles for welcome message */
    .vscode-light .welcome-msg {
      color: #2B2542;
    }

    /* Theme-specific styles for description and signing text */
    .vscode-light .description-text,
    .vscode-light .signing-text {
      color: #57546C;
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
        <div class="description-text">
        Work smoothly with automatic diagram sync 
        <br> 
        and quick, clickable references
        </div>

        <p class="signing-text">Sign in to get the full experience.</p>
        <div class="login-btn"> 
        <button id="signInButton">Sign in</button>
      </div>
    </div>
     <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('signInButton').addEventListener('click', () => {
            vscode.postMessage({ command: 'signIn' });
        });
    </script>
</body>
</html>`;
}

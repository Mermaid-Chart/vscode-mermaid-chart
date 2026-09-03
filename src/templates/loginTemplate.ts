import * as vscode from "vscode";

export function generateWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const logoSrc = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "images", "panel.svg")
  );
  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "recursive-latin-full-normal.woff2")
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid</title>
    <style>
    @font-face {
      font-family: "Recursive";
      src: url("${fontUrl}") format("woff2");
      font-weight: 300 900;
      font-style: normal;
    }

    :root {
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
    }

    body {
      margin: 0;
      padding: 28px 16px;
      background: var(--vscode-sideBar-background);
      color: var(--text-primary);
      font-family: "Recursive", sans-serif;
      font-size: 12px;
    }

    .container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .logo {
      width: 40px;
      height: 40px;
      margin-bottom: 16px;
    }

    .intro {
      margin: 0 0 24px;
      color: var(--text-primary);
      font-size: 13px;
      line-height: 17px;
    }

    .actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    button {
      width: 100%;
      min-height: 36px;
      padding: 8px 16px;
      border: 0;
      border-radius: 7px;
      color: #fff;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
    }

    .create-account {
      background: #ff006e;
    }

    .sign-in {
      background: #3d326c;
    }

    .sign-in:hover {
      background: #4a3d80;
    }

    .benefits {
      width: 100%;
      margin-top: 30px;
      text-align: left;
    }

    .benefits-title {
      margin: 0 0 14px;
      color: var(--text-primary);
      font-size: 11px;
      font-weight: 400;
    }

    .benefits ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .benefits li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 14px;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 15px;
    }

    .benefit-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 16px;
      height: 16px;
      color: var(--text-secondary);
    }

    .benefit-icon svg {
      display: block;
    }

    .preview-alternative {
      width: 100%;
      margin-top: 28px;
      text-align: left;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 16px;
    }

    .preview-link {
      color: var(--text-primary);
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    </style>
</head>
<body>
    <div class="container">
        <img class="logo" src="${logoSrc}" alt="Mermaid logo">
        <p class="intro">Sign in to sync your diagrams, use AI credits, and review changes across your team.</p>

        <div class="actions">
          <button class="create-account" id="createAccountButton" type="button">Create a free account</button>
          <button class="sign-in" id="signInButton" type="button">Sign in</button>
        </div>

        <section class="benefits">
          <h2 class="benefits-title">What you get:</h2>
          <ul>
            <li>
              <span class="benefit-icon">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <mask id="benefitSyncMask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12">
                    <rect width="12" height="12" fill="#D9D9D9"/>
                  </mask>
                  <g mask="url(#benefitSyncMask)">
                    <path d="M5.5 6.425L5.05 6.8625C4.95834 6.95417 4.84375 7 4.70625 7C4.56875 7 4.45 6.95 4.35 6.85C4.25834 6.75834 4.2125 6.64167 4.2125 6.5C4.2125 6.35834 4.25834 6.24167 4.35 6.15L5.65 4.85C5.75 4.75 5.86667 4.7 6 4.7C6.13334 4.7 6.25 4.75 6.35 4.85L7.65 6.15C7.74167 6.24167 7.78959 6.35625 7.79375 6.49375C7.79792 6.63125 7.75 6.75 7.65 6.85C7.55834 6.94167 7.44375 6.98959 7.30625 6.99375C7.16875 6.99792 7.05 6.95417 6.95 6.8625L6.5 6.425V9H9.25001C9.60001 9 9.89584 8.87917 10.1375 8.6375C10.3792 8.39584 10.5 8.1 10.5 7.75C10.5 7.4 10.3792 7.10417 10.1375 6.8625C9.89584 6.62084 9.60001 6.5 9.25001 6.5H8.5V5.5C8.5 4.80834 8.25625 4.21875 7.76875 3.73125C7.28125 3.24375 6.69167 3 6 3C5.30834 3 4.71875 3.24375 4.23125 3.73125C3.74375 4.21875 3.5 4.80834 3.5 5.5H3.25C2.76667 5.5 2.35417 5.67084 2.0125 6.0125C1.67083 6.35417 1.5 6.76667 1.5 7.25C1.5 7.73334 1.67083 8.14584 2.0125 8.4875C2.35417 8.82917 2.76667 9 3.25 9H4C4.14167 9 4.26042 9.04792 4.35625 9.14375C4.45209 9.23959 4.5 9.35834 4.5 9.5C4.5 9.64167 4.45209 9.76042 4.35625 9.85625C4.26042 9.95209 4.14167 10 4 10H3.25C2.49167 10 1.84375 9.7375 1.30625 9.2125C0.76875 8.6875 0.5 8.04584 0.5 7.2875C0.5 6.6375 0.695833 6.05834 1.0875 5.55C1.47917 5.04167 1.99167 4.71667 2.625 4.575C2.83333 3.80833 3.25 3.1875 3.875 2.7125C4.5 2.2375 5.20834 2 6 2C6.975 2 7.80209 2.33958 8.48125 3.01875C9.16042 3.69792 9.50001 4.525 9.50001 5.5C10.075 5.56667 10.5521 5.81459 10.9313 6.24375C11.3104 6.67292 11.5 7.175 11.5 7.75C11.5 8.375 11.2813 8.90625 10.8438 9.34375C10.4063 9.78125 9.87501 10 9.25001 10H6.5C6.225 10 5.98959 9.90209 5.79375 9.70625C5.59792 9.51042 5.5 9.275 5.5 9V6.425Z" fill="currentColor"/>
                  </g>
                </svg>
              </span>
              <span>Sync diagrams across your devices and the web</span>
            </li>
            <li>
              <span class="benefit-icon">
                <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <mask id="benefitReviewMask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                    <rect width="24" height="24" fill="#D9D9D9"/>
                  </mask>
                  <g mask="url(#benefitReviewMask)">
                    <path d="M1.9374 4.04155C1.93747 3.69783 2.00841 3.36075 2.14246 3.06715C2.27651 2.77355 2.46851 2.53473 2.69747 2.37679C2.92644 2.21885 3.18356 2.14786 3.44074 2.1716C3.69792 2.19533 3.94525 2.31286 4.15572 2.51135C4.36618 2.70984 4.53168 2.98165 4.63411 3.29708C4.73655 3.6125 4.77198 3.9594 4.73655 4.29986C4.70111 4.64032 4.59617 4.96124 4.43318 5.22755C4.2702 5.49386 4.05545 5.69531 3.8124 5.80989V10.1899C4.12533 10.3373 4.38909 10.6275 4.55705 11.0092C4.72502 11.3909 4.78638 11.8394 4.73028 12.2756C4.67418 12.7118 4.50424 13.1074 4.2505 13.3927C3.99675 13.6779 3.67554 13.8344 3.34365 13.8344C3.01175 13.8344 2.69054 13.6779 2.4368 13.3927C2.18305 13.1074 2.01311 12.7118 1.95701 12.2756C1.90091 11.8394 1.96227 11.3909 2.13024 11.0092C2.2982 10.6275 2.56197 10.3373 2.8749 10.1899V5.80989C2.60065 5.68061 2.36323 5.44112 2.19532 5.12442C2.02742 4.80772 1.93731 4.42939 1.9374 4.04155ZM5.48552 3.89405L6.98302 1.89739C7.00488 1.86818 7.03274 1.84827 7.06309 1.84021C7.09344 1.83214 7.1249 1.83626 7.15348 1.85206C7.18207 1.86786 7.20649 1.89462 7.22365 1.92895C7.24082 1.96328 7.24995 2.00363 7.2499 2.04489V3.41655H7.8749C8.2893 3.41655 8.68673 3.63605 8.97975 4.02675C9.27278 4.41745 9.4374 4.94735 9.4374 5.49989V10.1899C9.75033 10.3373 10.0141 10.6275 10.1821 11.0092C10.35 11.3909 10.4114 11.8394 10.3553 12.2756C10.2992 12.7118 10.1292 13.1074 9.8755 13.3927C9.62175 13.6779 9.30054 13.8344 8.96865 13.8344C8.63675 13.8344 8.31555 13.6779 8.0618 13.3927C7.80806 13.1074 7.63811 12.7118 7.58202 12.2756C7.52592 11.8394 7.58727 11.3909 7.75524 11.0092C7.92321 10.6275 8.18697 10.3373 8.4999 10.1899V5.49989C8.4999 5.27887 8.43405 5.06691 8.31684 4.91063C8.19963 4.75435 8.04066 4.66655 7.8749 4.66655H7.2499V6.03822C7.24995 6.07948 7.24082 6.11983 7.22365 6.15416C7.20649 6.18849 7.18207 6.21525 7.15348 6.23105C7.1249 6.24685 7.09344 6.25097 7.06309 6.2429C7.03274 6.23483 7.00488 6.21493 6.98302 6.18572L5.48552 4.18905C5.47097 4.1697 5.45943 4.14671 5.45155 4.1214C5.44367 4.09609 5.43962 4.06896 5.43962 4.04155C5.43962 4.01415 5.44367 3.98702 5.45155 3.96171C5.45943 3.9364 5.47097 3.91341 5.48552 3.89405ZM3.34365 3.41655C3.21933 3.41655 3.1001 3.4824 3.01219 3.59961C2.92428 3.71682 2.8749 3.87579 2.8749 4.04155C2.8749 4.20731 2.92428 4.36629 3.01219 4.4835C3.1001 4.60071 3.21933 4.66655 3.34365 4.66655C3.46797 4.66655 3.5872 4.60071 3.6751 4.4835C3.76301 4.36629 3.8124 4.20731 3.8124 4.04155C3.8124 3.87579 3.76301 3.71682 3.6751 3.59961C3.5872 3.4824 3.46797 3.41655 3.34365 3.41655ZM3.34365 11.3332C3.21933 11.3332 3.1001 11.3991 3.01219 11.5163C2.92428 11.6335 2.8749 11.7925 2.8749 11.9582C2.8749 12.124 2.92428 12.283 3.01219 12.4002C3.1001 12.5174 3.21933 12.5832 3.34365 12.5832C3.46797 12.5832 3.5872 12.5174 3.6751 12.4002C3.76301 12.283 3.8124 12.124 3.8124 11.9582C3.8124 11.7925 3.76301 11.6335 3.6751 11.5163C3.5872 11.3991 3.46797 11.3332 3.34365 11.3332ZM8.4999 11.9582C8.4999 12.124 8.54929 12.283 8.63719 12.4002C8.7251 12.5174 8.84433 12.5832 8.96865 12.5832C9.09297 12.5832 9.2122 12.5174 9.30011 12.4002C9.38801 12.283 9.4374 12.124 9.4374 11.9582C9.4374 11.7925 9.38801 11.6335 9.30011 11.5163C9.2122 11.3991 9.09297 11.3332 8.96865 11.3332C8.84433 11.3332 8.7251 11.3991 8.63719 11.5163C8.54929 11.6335 8.4999 11.7925 8.4999 11.9582Z" fill="currentColor"/>
                  </g>
                </svg>
              </span>
              <span>Review every diagram in a pull request at once, then accept them together</span>
            </li>
            <li>
              <span class="benefit-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M7.55255 10.6895L6.91711 12.1449C6.67311 12.7043 5.89881 12.7043 5.65423 12.1449L5.0188 10.6895C4.45307 9.39401 3.43534 8.36314 2.16561 7.7997L0.417007 7.02369C-0.139002 6.77682 -0.139002 5.96767 0.417007 5.72081L2.11132 4.96879C3.41363 4.3905 4.44964 3.32134 5.00565 1.98246L5.64909 0.431578C5.88795 -0.143859 6.68339 -0.143859 6.92226 0.431578L7.56569 1.98246C8.1217 3.32191 9.15772 4.39107 10.46 4.96879L12.1543 5.72081C12.7103 5.96767 12.7103 6.77682 12.1543 7.02369L10.4052 7.80027C9.13601 8.36371 8.1177 9.39458 7.55255 10.6895Z" fill="currentColor"/>
                  <path d="M13.4177 15.3118L13.224 15.7559C13.0823 16.081 12.632 16.081 12.4903 15.7559L12.2965 15.3118C11.9514 14.5204 11.3291 13.8901 10.5531 13.545L9.9565 13.2798C9.63364 13.1364 9.63364 12.6672 9.9565 12.5238L10.5199 12.2735C11.316 11.9198 11.9491 11.2661 12.2885 10.4478L12.4874 9.96776C12.6263 9.63347 13.0886 9.63347 13.2268 9.96776L13.4257 10.4478C13.7651 11.2661 14.3983 11.9198 15.1943 12.2735L15.7577 12.5238C16.0806 12.6672 16.0806 13.1364 15.7577 13.2798L15.1612 13.545C14.3851 13.8901 13.7629 14.5204 13.4177 15.3118Z" fill="currentColor"/>
                </svg>
              </span>
              <span>Generate, improve, and fix diagrams with AI</span>
            </li>
            <li>
              <span class="benefit-icon">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <mask id="benefitCommentMask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12">
                    <rect width="12" height="12" fill="#D9D9D9"/>
                  </mask>
                  <g mask="url(#benefitCommentMask)">
                    <path d="M3.5 7H8.50001C8.64167 7 8.76042 6.95209 8.85626 6.85625C8.95209 6.76042 9.00001 6.64167 9.00001 6.5C9.00001 6.35834 8.95209 6.23959 8.85626 6.14375C8.76042 6.04792 8.64167 6 8.50001 6H3.5C3.35834 6 3.23958 6.04792 3.14375 6.14375C3.04792 6.23959 3 6.35834 3 6.5C3 6.64167 3.04792 6.76042 3.14375 6.85625C3.23958 6.95209 3.35834 7 3.5 7ZM3.5 5.5H8.50001C8.64167 5.5 8.76042 5.45209 8.85626 5.35625C8.95209 5.26042 9.00001 5.14167 9.00001 5C9.00001 4.85834 8.95209 4.73959 8.85626 4.64375C8.76042 4.54792 8.64167 4.5 8.50001 4.5H3.5C3.35834 4.5 3.23958 4.54792 3.14375 4.64375C3.04792 4.73959 3 4.85834 3 5C3 5.14167 3.04792 5.26042 3.14375 5.35625C3.23958 5.45209 3.35834 5.5 3.5 5.5ZM3.5 4H8.50001C8.64167 4 8.76042 3.95208 8.85626 3.85625C8.95209 3.76042 9.00001 3.64167 9.00001 3.5C9.00001 3.35833 8.95209 3.23958 8.85626 3.14375C8.76042 3.04792 8.64167 3 8.50001 3H3.5C3.35834 3 3.23958 3.04792 3.14375 3.14375C3.04792 3.23958 3 3.35833 3 3.5C3 3.64167 3.04792 3.76042 3.14375 3.85625C3.23958 3.95208 3.35834 4 3.5 4ZM2 9C1.725 9 1.48958 8.90209 1.29375 8.70625C1.09792 8.51042 1 8.275 1 8V2C1 1.725 1.09792 1.48958 1.29375 1.29375C1.48958 1.09792 1.725 1 2 1H10C10.275 1 10.5104 1.09792 10.7063 1.29375C10.9021 1.48958 11 1.725 11 2V9.7875C11 10.0125 10.8979 10.1688 10.6938 10.2563C10.4896 10.3438 10.3083 10.3083 10.15 10.15L9.00001 9H2ZM9.42501 8L10 8.5625V2H2V8H9.42501Z" fill="currentColor"/>
                  </g>
                </svg>
              </span>
              <span>Comment, track version history, and share a team library</span>
            </li>
          </ul>
        </section>

        <p class="preview-alternative">
          Just want preview?<br>
          <a class="preview-link" id="getPreviewExtension">Get Mermaid Preview extension →</a>
        </p>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('createAccountButton').addEventListener('click', () => {
            vscode.postMessage({ command: 'createAccount' });
        });

        document.getElementById('signInButton').addEventListener('click', () => {
            vscode.postMessage({ command: 'signIn' });
        });

        document.getElementById('getPreviewExtension').addEventListener('click', () => {
            vscode.postMessage({ command: 'getPreviewExtension' });
        });
    </script>
</body>
</html>`;
}

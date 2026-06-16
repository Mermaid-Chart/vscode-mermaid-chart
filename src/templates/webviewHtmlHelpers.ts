import * as vscode from "vscode";
import { randomBytes } from "crypto";

/** Nonce for `script-src` in webview CSP (required by VS Code / Chromium). */
export function createWebviewNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * CSP meta tag for extension webviews. Without this, VS Code often blocks inline scripts
 * and the Sign-in / Suggestions panels render as empty.
 */
export function webviewCspMeta(webview: vscode.Webview, nonce: string): string {
  const c = webview.cspSource;
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${c} 'unsafe-inline'; img-src ${c} https: data:; font-src ${c}; script-src 'nonce-${nonce}'; connect-src https:;">`;
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

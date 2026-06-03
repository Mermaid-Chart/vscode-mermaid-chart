import type { WebviewApi } from "vscode-webview";

type WindowWithVscodeApi = Window & { __mermaidVscodeApi?: WebviewApi<unknown> };

/** VS Code allows only one `acquireVsCodeApi()` per webview — share it across scripts. */
export function acquireVsCodeApiOnce(): WebviewApi<unknown> | undefined {
  const w = window as WindowWithVscodeApi;
  if (w.__mermaidVscodeApi) {
    return w.__mermaidVscodeApi;
  }
  if (typeof acquireVsCodeApi !== "function") {
    return undefined;
  }
  w.__mermaidVscodeApi = acquireVsCodeApi();
  return w.__mermaidVscodeApi;
}

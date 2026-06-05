import type { WebviewApi } from "vscode-webview";

declare global {
  interface Window {
    /** Set by review chrome inline script before the Svelte bundle loads. */
    __mermaidVscodeApi?: WebviewApi<unknown>;
  }
}

function getVsCodeApi(): WebviewApi<unknown> | undefined {
  if (typeof window !== "undefined" && window.__mermaidVscodeApi) {
    return window.__mermaidVscodeApi;
  }
  if (typeof acquireVsCodeApi === "function") {
    const api = acquireVsCodeApi();
    if (typeof window !== "undefined") {
      window.__mermaidVscodeApi = api;
    }
    return api;
  }
  return undefined;
}

class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    this.vsCodeApi = getVsCodeApi();
  }

 
  public postMessage(message: unknown) {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    } else {
      console.log(message);
    }
  }


  public getState(): unknown | undefined {
    if (this.vsCodeApi) {
      return this.vsCodeApi.getState();
    } else {
      const state = localStorage.getItem("mermaidChart.vscodeState");
      return state ? JSON.parse(state) : undefined;
    }
  }

  public setState<T extends unknown | undefined>(newState: T): T {
    if (this.vsCodeApi) {
      return this.vsCodeApi.setState(newState);
    } else {
      localStorage.setItem("mermaidChart.vscodeState", JSON.stringify(newState));
      return newState;
    }
  }
}

export const vscode = new VSCodeAPIWrapper();
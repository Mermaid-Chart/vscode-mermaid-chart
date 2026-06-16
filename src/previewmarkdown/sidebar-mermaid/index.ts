import mermaid from "@mermaid-chart/mermaid";

interface SidebarMermaid {
  render(code: string, id: string): Promise<string>;
}

const isDark = (): boolean =>
  document.body.classList.contains("vscode-dark") ||
  document.body.classList.contains("vscode-high-contrast");

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark() ? "dark" : "default",
    flowchart: { useMaxWidth: true },
    sequence: { useMaxWidth: true },
    themeVariables: {
      fontSize: "11px",
    },
  });
  initialized = true;
}

(window as unknown as { sidebarMermaid: SidebarMermaid }).sidebarMermaid = {
  async render(code: string, id: string): Promise<string> {
    ensureInit();
    try {
      const { svg } = await mermaid.render(id, code);
      return svg;
    } catch {
      return "";
    }
  },
};

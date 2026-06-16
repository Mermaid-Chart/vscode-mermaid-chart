/** Mermaid diagram themes offered in preview / review webviews. */
export const MERMAID_PREVIEW_THEMES = [
  { key: "mc", name: "Mermaid Chart" },
  { key: "neo", name: "Neo" },
  { key: "neo-dark", name: "Neo Dark" },
  { key: "default", name: "Default" },
  { key: "forest", name: "Forest" },
  { key: "base", name: "Base" },
  { key: "dark", name: "Dark" },
  { key: "neutral", name: "Neutral" },
  { key: "redux-dark", name: "Redux Dark" },
  { key: "redux", name: "Redux" },
  { key: "redux-color", name: "Redux Color" },
  { key: "redux-dark-color", name: "Redux Dark Color" },
] as const;

export type MermaidPreviewThemeKey = (typeof MERMAID_PREVIEW_THEMES)[number]["key"];

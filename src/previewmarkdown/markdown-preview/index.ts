/**
 * Markdown preview: mermaid fences render as inline diagrams with hover controls.
 * VS Code morphdom-patches the preview on every edit (wiping our nodes) and then fires
 * vscode.markdown.updateContent in the same task, before paint. Each fence keeps a stable
 * slot (viewport + toolbars + Panzoom) that is re-attached synchronously in that handler;
 * only the SVG inside the viewport is swapped once a re-render finishes.
 */

import mermaid, { MermaidConfig } from "@mermaid-chart/mermaid";
import Panzoom from "@panzoom/panzoom";
import { mermaidChartContainerSelector } from "../shared-md-mermaid";
import { registerMermaidAddons, renderMermaidSource } from "../shared-mermaid";
import { PREVIEW_ICONS } from "./previewIcons";

const THEMES = [
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

type PanzoomInstance = ReturnType<typeof Panzoom>;

interface Slot {
    viewport: HTMLElement;
    left: HTMLElement;
    right: HTMLElement;
    error: HTMLElement;
    panzoom?: PanzoomInstance;
    panOn: boolean;
    source: string;
    /** morphdom strips id'd nodes (the mermaid SVG) even from our detached viewport, so keep the markup. */
    svg: string;
    /** Set when the last render failed. Restored into the diagram instead of the previous SVG. */
    errorText: string;
    /** Render key last sent to mermaid (success or failure), so unchanged sources are never re-rendered. */
    attemptedKey: string;
    abort?: AbortController;
}

let slots: Slot[] = [];
let previewTheme = "redux";
let themeOverride: string | undefined;
let maxZoomLevel = 5;
let maxTextSize = 50000;
let maxEdges = 1000;
let lastInitTheme = "";

function injectPreviewStyles(): void {
    if (document.getElementById("mermaid-chart-preview-style")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "mermaid-chart-preview-style";
    style.textContent = `
      ${mermaidChartContainerSelector} {
        position: relative;
        overflow: hidden;
        margin: 12px 0;
        border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
        border-radius: 4px;
        background: var(--vscode-editor-background, transparent);
        box-sizing: border-box;
        color: transparent;
      }
      ${mermaidChartContainerSelector} .mc-md-viewport {
        overflow: hidden;
        display: flex;
        justify-content: center;
      }
      ${mermaidChartContainerSelector} .mc-md-viewport > svg {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: auto;
        max-height: 80vh;
        display: block;
      }
      ${mermaidChartContainerSelector} .mc-md-error {
        white-space: pre-wrap;
        color: var(--vscode-errorForeground, #f44747);
        font-size: 12px;
        margin: 0;
        padding: 16px;
      }
      ${mermaidChartContainerSelector} .mc-md-bar {
        position: absolute;
        top: 8px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px;
        border-radius: 4px;
        background: var(--vscode-editorWidget-background, rgba(30,30,30,.92));
        border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
      }
      ${mermaidChartContainerSelector} .mc-md-left { left: 8px; }
      ${mermaidChartContainerSelector} .mc-md-right { right: 8px; }
      ${mermaidChartContainerSelector}:hover .mc-md-bar,
      ${mermaidChartContainerSelector}:focus-within .mc-md-bar,
      ${mermaidChartContainerSelector} .mc-md-bar.is-open {
        opacity: 1;
        pointer-events: auto;
      }
      ${mermaidChartContainerSelector} .mc-md-bar button {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--vscode-icon-foreground, #ccc);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      ${mermaidChartContainerSelector} .mc-md-bar button:hover {
        background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,.1));
      }
      ${mermaidChartContainerSelector} .mc-md-bar button.is-on {
        background: var(--vscode-button-background, #0078d4);
        color: var(--vscode-button-foreground, #fff);
      }
      ${mermaidChartContainerSelector} .mc-md-bar button svg {
        display: block;
        flex-shrink: 0;
        width: 16px;
        height: 16px;
      }
      ${mermaidChartContainerSelector} .mc-md-menu {
        position: absolute;
        top: 36px;
        left: 0;
        min-width: 160px;
        max-height: 280px;
        overflow: auto;
        z-index: 3;
        display: none;
        flex-direction: column;
        padding: 4px;
        border-radius: 4px;
        background: var(--vscode-editorWidget-background, #252526);
        border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      }
      ${mermaidChartContainerSelector} .mc-md-menu.is-open { display: flex; }
      ${mermaidChartContainerSelector} .mc-md-menu button {
        width: 100%;
        height: auto;
        justify-content: flex-start;
        padding: 6px 8px;
        font-size: 12px;
        color: var(--vscode-foreground, #ccc);
      }
    `;
    document.head.appendChild(style);
}

/** Same split the .mmd preview uses: dark themes sit on #1e1e1e, everything else on white. */
function diagramBackground(): string {
    return previewTheme.includes("dark") ? "#1e1e1e" : "#ffffff";
}

function mermaidConfig(): MermaidConfig {
    return {
        startOnLoad: false,
        suppressErrorRendering: true,
        maxTextSize,
        maxEdges,
        theme: previewTheme as MermaidConfig["theme"],
        flowchart: { parser: "jison" },
        sequence: { parser: "antlr" },
    } as MermaidConfig;
}

/** Trailing spaces and blank lines don't change the diagram; leading indentation does (mindmap). */
function renderKey(source: string): string {
    const normalized = source
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .join("\n");
    return `${previewTheme}\n${normalized}`;
}

function readConfig(): void {
    const configSpan = document.getElementById("markdown-mermaid");
    const darkModeTheme = configSpan?.dataset.darkModeTheme;
    const lightModeTheme = configSpan?.dataset.lightModeTheme;
    maxTextSize = configSpan?.dataset.maxTextSize ? Number(configSpan.dataset.maxTextSize) : 50000;
    maxEdges = configSpan?.dataset.maxEdges ? Number(configSpan.dataset.maxEdges) : 1000;
    maxZoomLevel = Number(configSpan?.dataset.maxZoom) || 5;
    previewTheme = themeOverride ?? (document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast")
        ? darkModeTheme ?? "dark"
        : lightModeTheme ?? "default");
}

function fitSvg(container: HTMLElement): void {
    const svg = container.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
        return;
    }
    try {
        const bbox = svg.getBBox();
        if (bbox.width > 0 && bbox.height > 0) {
            const pad = 10;
            svg.setAttribute(
                "viewBox",
                `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
            );
        }
    } catch {
        // getBBox throws if the SVG is not rendered yet
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.minWidth = "0";
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.maxHeight = "80vh";
}

function closeMenus(root: ParentNode = document): void {
    root.querySelectorAll(".mc-md-menu.is-open").forEach((el) => el.classList.remove("is-open"));
    root.querySelectorAll(".mc-md-bar.is-open").forEach((el) => el.classList.remove("is-open"));
}

function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function exportSvg(viewport: HTMLElement): void {
    const svg = viewport.querySelector("svg");
    if (!svg) {
        return;
    }
    downloadBlob("diagram.svg", new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" }));
}

function exportPng(viewport: HTMLElement): void {
    const svg = viewport.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
        return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.width) * 2;
        canvas.height = Math.max(1, image.height) * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.fillStyle = diagramBackground();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob) {
                downloadBlob("diagram.png", blob);
            }
        }, "image/png");
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

function makeButton(title: string, svg: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = svg;
    return button;
}

function makeMenu(bar: HTMLElement, button: HTMLButtonElement, items: Array<{ label: string; run: () => void }>): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "mc-md-menu";
    for (const { label, run } of items) {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = label;
        item.addEventListener("click", (event) => {
            event.stopPropagation();
            closeMenus();
            run();
        });
        menu.appendChild(item);
    }
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = menu.classList.contains("is-open");
        closeMenus();
        if (!open) {
            menu.classList.add("is-open");
            bar.classList.add("is-open");
        }
    });
    return menu;
}

function createSlot(): Slot {
    const viewport = document.createElement("div");
    viewport.className = "mc-md-viewport";
    const error = document.createElement("pre");
    error.className = "mc-md-error";
    error.hidden = true;

    const left = document.createElement("div");
    left.className = "mc-md-bar mc-md-left";
    const themeBtn = makeButton("Theme", PREVIEW_ICONS.theme);
    const themeMenu = makeMenu(left, themeBtn, THEMES.map((theme) => ({ label: theme.name, run: () => applyTheme(theme.key) })));
    const exportBtn = makeButton("Export", PREVIEW_ICONS.download);
    const exportMenu = makeMenu(left, exportBtn, [
        { label: "SVG", run: () => exportSvg(viewport) },
        { label: "PNG", run: () => exportPng(viewport) },
    ]);
    left.append(themeBtn, themeMenu, exportBtn, exportMenu);

    const right = document.createElement("div");
    right.className = "mc-md-bar mc-md-right";
    const panBtn = makeButton("Pan (or hold Alt)", PREVIEW_ICONS.pan);
    const zoomOutBtn = makeButton("Zoom out", PREVIEW_ICONS.zoomOut);
    const zoomInBtn = makeButton("Zoom in", PREVIEW_ICONS.zoomIn);
    const fitBtn = makeButton("Fit", PREVIEW_ICONS.fit);
    right.append(panBtn, zoomOutBtn, zoomInBtn, fitBtn);

    const slot: Slot = { viewport, left, right, error, panOn: false, source: "", svg: "", errorText: "", attemptedKey: "" };

    viewport.addEventListener("wheel", (event) => {
        if (!event.altKey && !event.ctrlKey) {
            return;
        }
        event.preventDefault();
        slot.panzoom?.zoomWithWheel(event);
    }, { passive: false });
    panBtn.addEventListener("click", () => {
        slot.panOn = !slot.panOn;
        panBtn.classList.toggle("is-on", slot.panOn);
        slot.panzoom?.setOptions({ disablePan: !slot.panOn });
        viewport.style.cursor = slot.panOn ? "grab" : "default";
    });
    zoomInBtn.addEventListener("click", () => slot.panzoom?.zoomIn());
    zoomOutBtn.addEventListener("click", () => slot.panzoom?.zoomOut());
    fitBtn.addEventListener("click", () => slot.panzoom?.reset());
    return slot;
}

function showDiagramError(slot: Slot, message: string): void {
    slot.svg = "";
    slot.errorText = message;
    slot.error.textContent = message;
    slot.error.hidden = false;
    slot.viewport.style.overflow = "auto";
    slot.viewport.replaceChildren(slot.error);
}

/** Synchronous: must finish before the browser paints the morphdom result. */
function attachSlots(): void {
    readConfig();
    injectPreviewStyles();
    const boxes = Array.from(document.querySelectorAll<HTMLElement>(mermaidChartContainerSelector));
    boxes.forEach((box, index) => {
        box.style.background = diagramBackground();
        const slot = slots[index] ?? (slots[index] = createSlot());
        if (box.contains(slot.viewport)) {
            return;
        }
        slot.source = box.textContent ?? "";
        box.replaceChildren(slot.viewport, slot.left, slot.right);
        if (slot.errorText) {
            showDiagramError(slot, slot.errorText);
        } else if (slot.svg && !slot.viewport.querySelector("svg")) {
            slot.viewport.innerHTML = slot.svg;
            fitSvg(slot.viewport);
        }
        // Panzoom requires the element to already be attached to the DOM.
        slot.panzoom ??= Panzoom(slot.viewport, { maxScale: maxZoomLevel, minScale: 0.5, disablePan: true });
    });
    for (const removed of slots.splice(boxes.length)) {
        removed.abort?.abort();
        removed.panzoom?.destroy();
    }
}

async function renderSlot(slot: Slot): Promise<void> {
    const key = renderKey(slot.source);
    if (!slot.source.trim() || key === slot.attemptedKey) {
        return;
    }
    slot.attemptedKey = key;
    slot.abort?.abort();
    const abort = new AbortController();
    slot.abort = abort;
    try {
        const { svg, bindFunctions } = await renderMermaidSource(slot.source, abort.signal);
        if (abort.signal.aborted) {
            return;
        }
        slot.errorText = "";
        slot.svg = svg;
        slot.viewport.style.overflow = "";
        slot.viewport.innerHTML = svg;
        fitSvg(slot.viewport);
        bindFunctions?.(slot.viewport);
    } catch (error) {
        if (abort.signal.aborted) {
            return;
        }
        showDiagramError(slot, error instanceof Error ? error.message : String(error));
    }
}

async function renderAll(): Promise<void> {
    if (lastInitTheme !== previewTheme) {
        mermaid.initialize(mermaidConfig());
        lastInitTheme = previewTheme;
    }
    await registerMermaidAddons();
    await Promise.all(slots.map(renderSlot));
}

function applyTheme(theme: string): void {
    themeOverride = theme;
    previewTheme = theme;
    document.querySelectorAll<HTMLElement>(mermaidChartContainerSelector).forEach((box) => {
        box.style.background = diagramBackground();
    });
    void renderAll();
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function onUpdate(): void {
    attachSlots();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void renderAll(), 120);
}

document.addEventListener("click", () => closeMenus());
window.addEventListener("keydown", (event) => {
    if (event.key !== "Alt") {
        return;
    }
    for (const slot of slots) {
        slot.panzoom?.setOptions({ disablePan: false });
    }
});
window.addEventListener("keyup", (event) => {
    if (event.key !== "Alt") {
        return;
    }
    for (const slot of slots) {
        slot.panzoom?.setOptions({ disablePan: !slot.panOn });
    }
});
window.addEventListener("vscode.markdown.updateContent", onUpdate);

function initialRender(): void {
    attachSlots();
    void renderAll();
}

// VS Code appends the initial markdown in its own DOMContentLoaded handler; run after it.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(initialRender));
} else {
    setTimeout(initialRender);
}

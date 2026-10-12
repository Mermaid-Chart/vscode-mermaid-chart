import mermaid, { MermaidConfig } from '@mermaid-chart/mermaid';
import { mermaidChartContainerSelector } from "../shared-md-mermaid";
import { getMermaidRenderHost } from "./renderHost";


interface RenderedDiagram {
    svg: string;
    bindFunctions?: (element: Element) => void;
}

/** Last successful render per (theme, source), so unchanged diagrams are restored synchronously. */
let renderCache = new Map<string, RenderedDiagram>();
/** Last SVG per diagram position, kept on screen while an edited diagram re-renders. */
let lastSvgByIndex: string[] = [];

function readSource(mermaidContainer: HTMLElement): string {
    // Ignore a previous render (svg / error) that may still be inside the container.
    return Array.from(mermaidContainer.childNodes)
        .filter((n) => !(n instanceof SVGElement) && !(n instanceof HTMLElement && n.classList.contains('mermaid-error')))
        .map((n) => n.textContent ?? '')
        .join('');
}

function renderMermaidElement(
    mermaidContainer: HTMLElement,
    index: number,
    nextCache: Map<string, RenderedDiagram>,
    writeOut: (mermaidContainer: HTMLElement, content: string) => void,
): {
    containerId: string;
    p: Promise<void>;
} {
    const containerId = `mermaid-container-${crypto.randomUUID()}`;
    const diagramId = `mermaid-${crypto.randomUUID()}`;

    const source = readSource(mermaidContainer);
    const cacheKey = `${mermaid.mermaidAPI.getConfig().theme ?? ''}\n${source}`;
    mermaidContainer.id = containerId;

    const cached = renderCache.get(cacheKey);
    if (cached) {
        nextCache.set(cacheKey, cached);
        writeOut(mermaidContainer, cached.svg);
        cached.bindFunctions?.(mermaidContainer);
        return { containerId, p: Promise.resolve() };
    }

    // Layout (ELK) can span several frames: keep the previous diagram visible instead of a blank box.
    const existingSvg = mermaidContainer.querySelector(':scope > svg');
    if (existingSvg) {
        mermaidContainer.replaceChildren(existingSvg);
    } else if (lastSvgByIndex[index]) {
        writeOut(mermaidContainer, lastSvgByIndex[index]);
    } else {
        mermaidContainer.innerHTML = '';
    }

    return {
        containerId,
        p: (async () => {
            try {
                // Catch any parsing errors
                await mermaid.parse(source);

                //  Render the diagram off-screen, then swap it in
                const renderResult = await mermaid.render(diagramId, source, getMermaidRenderHost());
                nextCache.set(cacheKey, { svg: renderResult.svg, bindFunctions: renderResult.bindFunctions });
                lastSvgByIndex[index] = renderResult.svg;
                writeOut(mermaidContainer, renderResult.svg);
                renderResult.bindFunctions?.(mermaidContainer);
            } catch (error) {
                if (error instanceof Error) {
                    const errorMessageNode = document.createElement('pre');
                    errorMessageNode.className = 'mermaid-error';
                    errorMessageNode.innerText = error.message;
                    writeOut(mermaidContainer, errorMessageNode.outerHTML);
                }

                throw error;
            }
        })()
    };
}

export async function renderMermaidBlocksInElement(root: HTMLElement, writeOut: (mermaidContainer: HTMLElement, content: string) => void): Promise<void> {
    for (const svg of Array.from(root.querySelectorAll('svg'))) {
        if (svg.parentElement?.id.startsWith('dmermaid')) {
            svg.parentElement.remove();
        }
    }

    const containers = Array.from(root.querySelectorAll<HTMLElement>(mermaidChartContainerSelector));
    const nextCache = new Map<string, RenderedDiagram>();
    lastSvgByIndex = lastSvgByIndex.slice(0, containers.length);

    // We need to generate all the container ids sync, but then do the actual rendering async
    const renderPromises: Array<Promise<void>> = [];
    containers.forEach((mermaidContainer, index) => {
        renderPromises.push(renderMermaidElement(mermaidContainer, index, nextCache, writeOut).p);
    });

    try {
        for (const p of renderPromises) {
            await p;
        }
    } finally {
        // Only keep entries for diagrams still in the document.
        renderCache = nextCache;
    }
}



export async function registerMermaidAddons() {
 
    mermaid.registerIconPacks([
        {
          name: 'fa',
          loader: () => import('@iconify-json/fa6-regular').then((m) => m.icons),
        },
        {
          name: 'aws',
          loader: () => import('@mermaid-chart/icons-aws').then((m) => m.icons),
        },
        {
          name: 'azure',
          loader: () => import('@mermaid-chart/icons-azure').then((m) => m.icons),
        },
        {
          name: 'gcp',
          loader: () => import('@mermaid-chart/icons-gcp').then((m) => m.icons),
        },
        {
            name: 'logos',
            loader: () => import('@iconify-json/logos').then((module) => module.icons),
          },
          {
            name: 'mdi',
            loader: () => import('@iconify-json/mdi').then((module) => module.icons),
          },
      ]);
   
}

export function loadMermaidConfig(): MermaidConfig {
    const configSpan = document.getElementById('markdown-mermaid');
    const darkModeTheme = configSpan?.dataset.darkModeTheme;
    const lightModeTheme = configSpan?.dataset.lightModeTheme;

    return {
        startOnLoad: false,
        theme: (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
            ? darkModeTheme ?? 'dark'
            : lightModeTheme ?? 'default') as MermaidConfig['theme'],
    };
}

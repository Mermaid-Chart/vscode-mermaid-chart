import mermaid, { MermaidConfig } from '@mermaid-chart/mermaid';
import { getMermaidRenderHost } from "./renderHost";
import { prepareLogosIcons } from "./prepareLogosIcons";


export interface RenderedDiagram {
    svg: string;
    bindFunctions?: (element: Element) => void;
}

let mermaidRenderLock: Promise<void> = Promise.resolve();
let mermaidRenderSeq = 0;

function isMissingSvgAttrError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('getAttribute');
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
        || error instanceof Error && error.name === 'AbortError';
}

function nextDiagramId(): string {
    return `mcmd${++mermaidRenderSeq}`;
}

/** One mermaid.render at a time, same host as the .mmd preview. Retry the first-load getAttribute miss. */
export async function renderMermaidSource(source: string, signal?: AbortSignal): Promise<RenderedDiagram> {
    const run = async (): Promise<RenderedDiagram> => {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const host = getMermaidRenderHost();
        const attempt = async () => mermaid.render(nextDiagramId(), source, host);
        try {
            const result = await attempt();
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            return { svg: result.svg, bindFunctions: result.bindFunctions };
        } catch (error) {
            if (isAbortError(error) || !isMissingSvgAttrError(error)) {
                throw error;
            }
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            const result = await attempt();
            return { svg: result.svg, bindFunctions: result.bindFunctions };
        }
    };
    const done = mermaidRenderLock.then(run, run);
    mermaidRenderLock = done.then(() => undefined, () => undefined);
    return done;
}

let addonsRegistered = false;

export async function registerMermaidAddons() {
    if (addonsRegistered) {
        return;
    }
    addonsRegistered = true;
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
            loader: () => import('@iconify-json/logos').then((module) => prepareLogosIcons(module.icons)),
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

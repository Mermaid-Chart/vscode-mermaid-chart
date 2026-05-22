/**
 * Main entrypoint for the markdown preview.
 * 
 * This runs in the markdown preview's webview.
 */

import mermaid, { MermaidConfig } from "@mermaid-chart/mermaid";
import { registerMermaidAddons, renderMermaidBlocksInElement } from '../shared-mermaid';

function injectSaveDiagramStyles() {
    if (document.getElementById('mermaid-save-diagram-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'mermaid-save-diagram-styles';
    style.textContent = `
        .mermaid-save-btn-wrapper {
            display: flex;
            justify-content: flex-end;
            padding: 6px 8px 2px 8px;
        }
        .mermaid-save-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 14px;
            border: none;
            border-radius: 4px;
            background-color: #E0095F;
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s ease-in-out;
            white-space: nowrap;
            line-height: 1;
        }
        .mermaid-save-btn:hover {
            background-color: #c40065;
        }
        .mermaid-save-btn-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #323232;
            color: #fff;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }
        .mermaid-save-btn-toast.visible {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}

function addSaveDiagramButtons() {
    const containers = document.querySelectorAll<HTMLElement>('.mermaid[data-source]');
    containers.forEach((container) => {
        if (container.querySelector('.mermaid-save-btn-wrapper')) {
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-save-btn-wrapper';

        const btn = document.createElement('button');
        btn.className = 'mermaid-save-btn';
        btn.title = 'Save diagram to Mermaid Chart';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="#ffffff"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>Save Diagram`;

        btn.addEventListener('click', () => {
            window.open('https://mermaid.ai/app/sign-up', '_blank');
        });

        wrapper.appendChild(btn);
        container.appendChild(wrapper);
    });
}

function init() { 
    const configSpan = document.getElementById('markdown-mermaid');
    const darkModeTheme = configSpan?.dataset.darkModeTheme;
    const lightModeTheme = configSpan?.dataset.lightModeTheme;
    const maxTextSize = configSpan?.dataset.maxTextSize;

    const config: MermaidConfig = {
        startOnLoad: false,
        maxTextSize: maxTextSize ? Number(maxTextSize) : 50000,
        theme: (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
            ? darkModeTheme ?? 'dark'
            : lightModeTheme ?? 'default' ) as MermaidConfig['theme'],
    };

    mermaid.initialize(config);
    registerMermaidAddons();
    
    injectSaveDiagramStyles();

    renderMermaidBlocksInElement(document.body, (mermaidContainer, content) => {
        mermaidContainer.innerHTML = content;
    }).then(() => {
        addSaveDiagramButtons();
    });
}

window.addEventListener('vscode.markdown.updateContent', init);
init();

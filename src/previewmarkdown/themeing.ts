import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { shouldChartHandleMarkdownPreview } from '../loginTrigger';
import { configSection } from '../util';
import { prepareMermaidChartHtml } from './shared-md-mermaid';

const defaultMermaidTheme = 'default';
const validMermaidThemes = [
    'neo',
    'redux',
    'mc',
    'null',
    'default',
    'base',
    'forest',
    'dark',
    'neutral',
    'neo-dark',             
    'redux-dark',
    'redux-color', 
    'redux-dark-color'
];

function sanitizeMermaidTheme(theme: string | undefined) {
    return typeof theme === 'string' && validMermaidThemes.includes(theme) ? theme : defaultMermaidTheme;
}

export function injectMermaidTheme(md: MarkdownIt) {
    const render = md.renderer.render;

    md.renderer.render = function (...args) {
        if (!shouldChartHandleMarkdownPreview()) {
            return render.apply(md.renderer, args);
        }
        const config = vscode.workspace.getConfiguration(configSection);
        const darkModeTheme = sanitizeMermaidTheme(config.get<string>('vscode.dark'));
        const lightModeTheme = sanitizeMermaidTheme(config.get<string>('vscode.light'));
        const maxTextSize = config.get<number>('maxTextSize');
        const maxZoom = config.get<number>('vscode.maxZoom') ?? 5;
        const maxEdges = config.get<number>('vscode.maxEdges') ?? 1000;

        const html = `<span id="markdown-mermaid" aria-hidden="true"
                    data-dark-mode-theme="${darkModeTheme}"
                    data-light-mode-theme="${lightModeTheme}"
                    data-max-text-size="${maxTextSize}"
                    data-max-zoom="${maxZoom}"
                    data-max-edges="${maxEdges}"></span>
                ${render.apply(md.renderer, args)}`;
        return prepareMermaidChartHtml(html);
    };

    return md;
}
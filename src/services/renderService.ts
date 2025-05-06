import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import {extractConfigFromFrontmatter } from '../frontmatter';
import path from 'path';

const RENDERING_SERVER_URL = '';

export interface RenderExternalDiagramOptions {
  look?: string;
  theme?: string;
  darkModeEnabled?: boolean;
  contentType?: 'image/png' | 'image/svg+xml';
  positions?: any;
  layout?: string;
}

/**
 * Renders a Mermaid diagram using the external rendering service
 */
export async function renderExternalDiagram(
  code: string,
  options: RenderExternalDiagramOptions = {}
): Promise<Buffer> {
  const {
    look = 'classic',
    theme = 'neo',
    darkModeEnabled = false,
    contentType = 'image/png',
    layout = 'dagre',
    positions,
  } = options;

  try {
    // Get API key from configuration or environment
    const config = vscode.workspace.getConfiguration('mermaidChart');
    const apiKey = config.get<string>('renderingApiKey', '');

    if (!apiKey) {
      throw new Error('Rendering API key is not configured');
    }

    return Buffer.from('Test');
  } catch (error) {
    console.error('Error while calling external rendering server', error);
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout while rendering the diagram. Please try again or simplify your diagram.');
      }
      
      if (error.response) {
        if (error.response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        throw new Error(`Error ${error.response.status}: ${error.response.statusText}`);
      }
    }
    
    throw new Error('Error rendering diagram. Please check your diagram syntax and try again.');
  }
}

export async function exportDiagramAsSvg(document:vscode.TextDocument, svgcode: string): Promise<void> {

  try {
    // Get filename without extension
    const baseName = path.basename(document.fileName, path.extname(document.fileName));
    const defaultUri = document.uri
      ? vscode.Uri.joinPath(document.uri, `../${baseName}.svg`)
      : undefined;

    // Ask user where to save the file
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: defaultUri,
      filters: {
        'SVG Image': ['svg']
      },
      title: `Export Mermaid Diagram as SVG image`
    });
    
    if (saveUri) {
      // Convert base64 to buffer
      const svgBuffer = Buffer.from(svgcode, 'base64');
      
      // Write the SVG file
      await vscode.workspace.fs.writeFile(saveUri, svgBuffer);
      vscode.window.showInformationMessage(`Diagram exported to ${saveUri.fsPath}`);
    }
  } catch (error) {
    console.error('Error exporting SVG:', error);
    vscode.window.showErrorMessage(`Failed to export SVG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Exports the current diagram to PNG using the external rendering service
 */
export async function exportDiagramAsPng(document: vscode.TextDocument): Promise<void> {
  try {
    // Show progress indicator
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Generating high-resolution PNG...',
      cancellable: false
    }, async (progress) => {
      // Get the document content
      const code = document.getText();
      
      // Extract theme, look and layout from frontmatter
      const frontmatterConfig = extractConfigFromFrontmatter(code);
      
      // Get the current theme (dark/light)
      const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
            
      // Use frontmatter values if available, otherwise use defaults
      const theme = frontmatterConfig.theme || (isDarkTheme ? 'neo-dark' : 'neo');
      const isDarkModeEnabled = frontmatterConfig.theme?.includes('dark');
      const look = frontmatterConfig.look || 'classic';
      const layout = frontmatterConfig.layout || 'dagre';
      
      // Render the diagram
      const pngBuffer = await renderExternalDiagram(code, {
        theme: theme,
        look,
        layout,
        darkModeEnabled: isDarkModeEnabled,
        contentType: 'image/png',
      });
      
      const baseName = path.basename(document.fileName, path.extname(document.fileName));
      const defaultUri = document.uri ?
         vscode.Uri.joinPath(document.uri, `../${baseName}.png`) :
         undefined;

      // Ask user where to save the file
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        filters: {
          'PNG Image': ['png']
        },
        title: `Export Mermaid Diagram as PNG image`
      });
      
      if (saveUri) {
        // Write the PNG file
        await vscode.workspace.fs.writeFile(saveUri, pngBuffer);
        vscode.window.showInformationMessage(`Diagram exported to ${saveUri.fsPath}`);
      }
    });
  } catch (error) {
    console.error('Error exporting PNG:', error);
    vscode.window.showErrorMessage(`Sorry, we were unable to generate a PNG of your diagram. Please make sure your diagram has no syntax errors in it and try again.`);
  }
}

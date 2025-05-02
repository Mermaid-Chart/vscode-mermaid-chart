import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import {extractConfigFromFrontmatter } from '../frontmatter';
import path from 'path';

const RENDERING_SERVER_URL = 'https://render.mermaidchart.com/';

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
    const apiKey = config.get<string>('renderingApiKey', 'cb5fvJ3tayWZCjsfdBWb');

    if (!apiKey) {
      throw new Error('Rendering API key is not configured');
    }

    const response = await axios.post(RENDERING_SERVER_URL, {
      code,
      apiKey,
      look,
      theme,
      darkModeEnabled,
      contentType,
      layout,
      positions,
    }, {
      responseType: 'arraybuffer',
      timeout: 59000, // 59 seconds timeout
    });

    if (response.status !== 200) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return Buffer.from(response.data);
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
      
      // Get theme configuration
      const config = vscode.workspace.getConfiguration('mermaidChart');
      
      // Use frontmatter values if available, otherwise use defaults
      const theme = frontmatterConfig.theme || (isDarkTheme ? 'neo-dark' : 'neo');
      const look = frontmatterConfig.look || 'neo';
      const layout = frontmatterConfig.layout || 'dagre';
      
    //   // Apply dark theme variant if needed
    //   const effectiveTheme = isDarkTheme && !theme.includes('dark') 
    //     ? `${theme}-dark` 
    //     : theme;
      
      // Render the diagram
      const pngBuffer = await renderExternalDiagram(code, {
        theme: theme,
        look,
        layout,
        darkModeEnabled: isDarkTheme,
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
    vscode.window.showErrorMessage(`Failed to export PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

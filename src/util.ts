import { Disposable, Event, EventEmitter, authentication } from "vscode";
import { createHash } from "crypto";
import * as vscode from "vscode";
import { MermaidChartVSCode } from "./mermaidChartVSCode";
import {
  MermaidChartProvider,
  ITEM_TYPE_DOCUMENT,
} from "./mermaidChartProvider";
import path = require("path");

const activeListeners = new Map<string, vscode.Disposable>();


export const pattern : Record<string, RegExp> = {
  ".md": /```mermaid([\s\S]*?)```/g,
  ".html": /<div class=["']mermaid["']>([\s\S]*?)<\/div>/g,
  ".hugo": /{{<mermaid[^>]*>}}([\s\S]*?){{<\/mermaid>}}/g,
  ".rst": /\.\. mermaid::(?:[ \t]*)?$(?:(?:\n[ \t]+:(?:(?:\\:\s)|[^:])+:[^\n]*$)+\n)?((?:\n(?:[ \t][^\n]*)?$)+)?/gm,
};

export interface PromiseAdapter<T, U> {
  (
    value: T,
    resolve: (value: U | PromiseLike<U>) => void,
    reject: (reason: any) => void
  ): any;
}

const passthrough = (value: any, resolve: (value?: any) => void) =>
  resolve(value);

/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
export function promiseFromEvent<T, U>(
  event: Event<T>,
  adapter: PromiseAdapter<T, U> = passthrough
): { promise: Promise<U>; cancel: EventEmitter<void> } {
  let subscription: Disposable;
  let cancel = new EventEmitter<void>();

  return {
    promise: new Promise<U>((resolve, reject) => {
      cancel.event((_) => reject("Cancelled"));
      subscription = event((value: T) => {
        try {
          Promise.resolve(adapter(value, resolve, reject)).catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    }).then(
      (result: U) => {
        subscription.dispose();
        return result;
      },
      (error) => {
        subscription.dispose();
        throw error;
      }
    ),
    cancel,
  };
}

export const getEncodedSHA256Hash = (str: string) => {
  const hash = createHash("sha256").update(str).digest("hex");

  return Buffer.from(hash)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export interface MermaidChartToken {
  uuid: string;
  title: string;
  range: vscode.Range;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  uri?: vscode.Uri
}
export function findMermaidChartTokens(
  document: vscode.TextDocument,
  comments: vscode.Range[]
): MermaidChartToken[] {
  const mermaidChartTokens: MermaidChartToken[] = [];

  for (const commentRange of comments) {
    const commentText = document.getText(commentRange);
    const mermaidChartTokenRegex =
      /\[MermaidChart: ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})]/g;
    let match: RegExpExecArray | null;

    while ((match = mermaidChartTokenRegex.exec(commentText)) !== null) {
      const uuid = match[1];
      const startCharacter = commentRange.start.character + (match.index || 0);
      const endCharacter = startCharacter + match[0].length;
      const lineNumber = commentRange.start.line;
      mermaidChartTokens.push({
        uuid,
        title: `Chart - ${uuid}`,
        range: new vscode.Range(
          lineNumber,
          startCharacter,
          lineNumber,
          endCharacter
        ),
      });
    }
  }

  return mermaidChartTokens;
}

export function findMermaidChartTokensFromAuxFiles(document: vscode.TextDocument): MermaidChartToken[] {
  const mermaidChartTokens: MermaidChartToken[] = [];
  const text = document.getText();
  const regex = pattern[path.extname(document.fileName)];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const range = new vscode.Range(
      document.positionAt(match.index),
      document.positionAt(match.index + match[0].length)
    );
    mermaidChartTokens.push({
      title: `Chart - ${extractIdFromCode(document.getText(range)) || ""}`,
      uri: document.uri,
      range,
      uuid: extractIdFromCode(document.getText(range)) || "",
    });
  }

  return mermaidChartTokens;
}

export function applyMermaidChartTokenHighlighting(
  editor: vscode.TextEditor,
  mermaidChartTokens: MermaidChartToken[],
  mermaidChartTokenDecoration: vscode.TextEditorDecorationType
) {
  editor.setDecorations(
    mermaidChartTokenDecoration,
    mermaidChartTokens.map((token) => token.range)
  );
}

export function findComments(document: vscode.TextDocument): vscode.Range[] {
  const comments: vscode.Range[] = [];
  const commentPattern = /(?:\/\/|#|\/\*|<!--).*$/gm;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const line = document.lineAt(lineNumber);
    let match;

    while ((match = commentPattern.exec(line.text)) !== null) {
      const startPosition = new vscode.Position(lineNumber, match.index);
      const endPosition = new vscode.Position(
        lineNumber,
        match.index + match[0].length
      );
      comments.push(new vscode.Range(startPosition, endPosition));
    }
  }

  return comments;
}

/**
 * Convert SVG xml to png base64 url
 * @param {any} svgXml
 */
export function getImageDataURL(svgXml: string) {
  let base64 = encodeURIComponent(
    Buffer.from(svgXml, "utf8").toString("base64")
  );
  return "data:image/svg+xml;base64," + base64;
}

export async function viewMermaidChart(
  mcAPI: MermaidChartVSCode,
  uuid: string
) {
  const panel = vscode.window.createWebviewPanel(
    "mermaidChartView",
    `Mermaid Chart: ${uuid}`,
    vscode.ViewColumn.One,
    {}
  );

  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark; //ColorTheme.Light;
  // Choose the appropriate URL based on the current theme
  const themeParameter = isDarkTheme ? "dark" : "light";
  const svgContent = await mcAPI.getRawDocument(
    {
      documentID: uuid,
      major: "0",
      minor: "1",
    },
    themeParameter
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en" style="height: 100%;">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="height: 100%; margin: 0; padding: 0; overflow: hidden;">
        <iframe sandbox="allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation" src="${getImageDataURL(
          svgContent
        )}" style="width: 100%; height: 100%; border: none;"></iframe>
    </body>
    </html>`;
}
export async function editMermaidChart(
  mcAPI: MermaidChartVSCode,
  uuid: string,
  provider: MermaidChartProvider
) {
  // const project = provider.getProjectOfDocument(uuid);
  // const projectUuid = project?.uuid;
  // if (!projectUuid) {
  //   vscode.window.showErrorMessage(
  //     "Diagram not found in project. Diagram might have moved to a different project."
  //   );
  //   return;
  // }
  const editUrl = await mcAPI.getEditURL({
    documentID: uuid,
  });
  vscode.env.openExternal(vscode.Uri.parse(editUrl));
}

export async function insertMermaidChartToken(
  uuid: string,
  provider: MermaidChartProvider
) {
  // If a project is selected from tree-view, no token shall be inserted
  const itemType = provider.getItemTypeFromUuid(uuid);
  if (itemType !== ITEM_TYPE_DOCUMENT) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const mermaidChartTokenLine = getCommentLine(editor, uuid);

  editor.edit((editBuilder) => {
    editBuilder.insert(
      new vscode.Position(editor.selection.active.line, 0),
      `${mermaidChartTokenLine}\n`
    );
  });
}

const getCommentLine = (editor: vscode.TextEditor, uuid: string): string => {
  const languageId = editor.document.languageId;
  switch (languageId) {
    case "markdown":
    case "html":
      return `<!-- [MermaidChart: ${uuid}] -->`;
    case "yaml":
    case "python":
      return `# [MermaidChart: ${uuid}]`;
    case "json":
    case "javascript":
    case "typescript":
    case "java":
    case "c":
    case "c++":
    case "c#":
    default:
      return `// [MermaidChart: ${uuid}]`;
  }
};


/**
 * Ensures the diagram code has a config block with the given ID.
 * @param code The original diagram code.
 * @param diagramId The ID to include in the config block.
 * @returns The updated diagram code.
 */
export function ensureConfigBlock(code: string, diagramId: string): string {
  const configPattern = /^---\s*config:\s*([\s\S]*?)---/m; // Regex to match the config block
  const idLine = `    id: ${diagramId}\n`;

  if (configPattern.test(code)) {
    // If config block exists, update or append the ID
    const updatedCode = code.replace(configPattern, (match, configContent) => {
      if (configContent.includes("id:")) {
        // Update the existing ID
        return match.replace(/id:\s*.+/m, idLine.trim());
      } else {
        // Append the ID
        return match.replace("config:", `config:\n${idLine}`);
      }
    });

    // Check for and remove empty lines below the id field
    return updatedCode.replace(/(id:\s*.+)\n\s*\n/m, "$1\n");
  } else {
    // If config block doesn't exist, add the entire block
    const configBlock = `---\nconfig:\n${idLine}---\n\n`;
    return configBlock + code;
  }
}

// Function to extract the 'id' from the code block using a regex
export function extractIdFromCode(code: string): string | null {
  const configPattern = /^---\s*config:\s*([\s\S]*?)---/m;
  const idPattern = /id:\s*(\S+)/;

  const match = configPattern.exec(code);
  if (match && match[1]) {
    // Match the id inside the config block
    const idMatch = idPattern.exec(match[1]);
    if (idMatch) {
      return idMatch[1]; // Return the ID found
    }
  }
  return null; // Return null if no ID is found
}

export function extractMermaidCode(content: string, fileExt: string): string[] {
  try {
    const mermaidRegex = pattern[fileExt];
    if (!mermaidRegex) {
      console.warn(`No regex pattern found for file extension: ${fileExt}`);
      return [];
    }

    const matches: string[] = [];
    let match;

    while ((match = mermaidRegex.exec(content)) !== null) {
      if (match[1]) {
        if (fileExt === ".rst") {
          let extractedCode = match[1].trim(); // Trim leading & trailing spaces
  
          // Ensure `---` lines have no indentation, but `config:` is indented
          extractedCode = extractedCode.replace(
            /^\s*---\s*\n\s*(config:\s*\n[\s\S]*?)\n\s*---\s*/m,
            (fullMatch, configContent) => {
              // Ensure `config:` and its contents are indented correctly
              const indentedConfig = configContent
                .split("\n")
                .map((line: any) => `  ${line.trimStart()}`) // Indent each line by 2 spaces
                .join("\n");
  
              return `---\n${indentedConfig}\n---`;
            }
          );
          matches.push(extractedCode);
        } else {
          matches.push(match[1].trim());
        }
      }
    }

    if (matches.length === 0) {
      console.warn("No valid Mermaid code blocks found.");
    }

    return matches;
  } catch (error) {
    console.error("Error extracting Mermaid code:", error);
    return [];
  }
}

export function syncAuxFile(tempFileUri: string, originalFileUri: vscode.Uri,range: vscode.Range) {
  
  if (activeListeners.has(tempFileUri)) {
    
    activeListeners.get(tempFileUri)?.dispose();
    activeListeners.delete(tempFileUri);
  }

  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() === tempFileUri) {
      syncFiles(originalFileUri, event.document.getText(),range);
    }
  });

  activeListeners.set(tempFileUri, disposable);

  vscode.workspace.onDidCloseTextDocument((closedDoc) => {
    if (closedDoc.uri.toString() === tempFileUri) {
      setTimeout(() => {
        const isReopened = vscode.workspace.textDocuments.some(
          (doc) => doc.uri.toString() === tempFileUri
        );
        if (!isReopened) {
          activeListeners.get(tempFileUri)?.dispose();
          activeListeners.delete(tempFileUri);
        } 
      }, 500);
    }
  });
}

export function syncFiles(
  fileUri: vscode.Uri,
  mermaidCode: string,
  range: vscode.Range 
) {
  if (!mermaidCode || mermaidCode.trim() === "") {
    return;
  }

  vscode.workspace.openTextDocument(fileUri).then((doc) => {
    const text = doc.getText();
    const fileExt = fileUri.fsPath.split('.').pop()?.toLowerCase();

    const patterns: Record<string, RegExp> = {
      "md": /```mermaid([\s\S]*?)```/g,
      "html": /<div class=["']mermaid["']>([\s\S]*?)<\/div>/g,
      "hugo": /{{<mermaid[^>]*>}}([\s\S]*?){{<\/mermaid>}}/g,
      "rst": /\.\. mermaid::(?:[ \t]*)?$(?:(?:\n[ \t]+:(?:(?:\\:\s)|[^:])+:[^\n]*$)+\n)?((?:\n(?:[ \t][^\n]*)?$)+)?/gm
    };

    const startTags: Record<string, string> = {
      "md": "```mermaid\n",
      "html": '<div class="mermaid">\n',
      "hugo": "{{<mermaid>}}\n",
      "rst": ".. mermaid::\n" 
    };

    const endTags: Record<string, string> = {
      "md": "\n```",
      "html": "\n</div>",
      "hugo": "\n{{</mermaid>}}",
      "rst": "" 
    };

    if (!fileExt || !patterns[fileExt]) {
      vscode.window.showErrorMessage(`Unsupported file type: .${fileExt}`);
      return;
    }

    const regex = patterns[fileExt];
    let match = regex.exec(text);
    let lastMatchRange: vscode.Range | null = null;

    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      lastMatchRange = new vscode.Range(doc.positionAt(start), doc.positionAt(end));
      
      if (lastMatchRange.contains(range.start)) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        let formattedCode = `${startTags[fileExt]}${mermaidCode}${endTags[fileExt]}`;

        // Add indentation for .rst files
        if (fileExt === "rst") {
          formattedCode = startTags[fileExt] + 
                          mermaidCode
                            .split("\n")
                            .map(line => `  ${line}`) // Add 2 spaces at the start of each line
                            .join("\n") + 
                          endTags[fileExt];
        }

        workspaceEdit.replace(fileUri, lastMatchRange, formattedCode);
        vscode.workspace.applyEdit(workspaceEdit);
        break; 
      }
      match = regex.exec(text); 
    }
  });
}


export function checkDiagramId(range: vscode.Range): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found!');
    return false; 
  }

  const documentText = editor.document.getText(range);


  return !!extractIdFromCode(documentText); 
}

export function isAuxFile(fileName: string): boolean {
  const allowedExt = [".md", ".html", ".hugo", ".rst"];
  const fileExt = path.extname(fileName).toLowerCase();

  return allowedExt.includes(fileExt);
}
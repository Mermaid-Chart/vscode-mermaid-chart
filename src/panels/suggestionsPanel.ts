import * as vscode from "vscode";
import { createWebviewNonce, escapeHtmlAttr } from "../templates/webviewHtmlHelpers";
import { sendLanguageModelUserPrompt, isLanguageModelAvailable } from "../services/vscodeLanguageModel";
import { canOpenMermaidPreview } from "../util";

export interface DiagramSuggestionItem {
  id: string;
  title: string;
  description: string;
  category: "style" | "structure" | "readability" | "best-practice";
  priority: "high" | "medium" | "low";
  /** When `false`, the fix needs an LLM and "Apply" won't work without one. */
  autoFixable?: boolean;
}

interface AlternativeItem {
  id: string;
  title: string;
  description: string;
  code: string;
}

export class SuggestionsPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "mermaidSuggestions";
  private view?: vscode.WebviewView;
  private suggestions: DiagramSuggestionItem[] = [];
  private alternatives: AlternativeItem[] = [];
  private isGeneratingAlternatives = false;
  private currentDiagramCode = "";

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    this.updateView();
    void this.analyzeCurrent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "applySuggestion") {
        await this.applySuggestion(message.id);
      } else if (message.type === "refresh") {
        await this.analyzeCurrent();
      } else if (message.type === "generateAlternatives") {
        await this.generateAlternatives();
      } else if (message.type === "applyAlternative") {
        await this.applyAlternative(message.id);
      }
    });
  }

  public async analyzeCurrent(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.suggestions = [];
      this.currentDiagramCode = "";
      this.updateView();
      return;
    }

    const doc = editor.document;
    const isMermaid =
      doc.fileName.endsWith(".mmd") ||
      doc.fileName.endsWith(".mermaid") ||
      doc.languageId.startsWith("mermaid");

    if (!isMermaid) {
      this.suggestions = [];
      this.currentDiagramCode = "";
      this.updateView();
      return;
    }

    const code = doc.getText();
    this.currentDiagramCode = code;
    this.suggestions = analyzeForSuggestions(code);
    this.alternatives = [];
    this.updateView();
  }

  private async applySuggestion(suggestionId: string): Promise<void> {
    const suggestion = this.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const code = editor.document.getText();

    const ruleResult = applyRuleBasedFix(suggestionId, code);
    if (ruleResult) {
      await this.replaceDocumentContent(editor, ruleResult);
      this.suggestions = this.suggestions.filter((s) => s.id !== suggestionId);
      this.updateView();
      vscode.window.showInformationMessage(`Applied: ${suggestion.title}`);
      return;
    }

    const llmResult = await this.tryLlmApply(suggestion, code);
    if (llmResult) {
      await this.replaceDocumentContent(editor, llmResult);
      this.suggestions = this.suggestions.filter((s) => s.id !== suggestionId);
      this.updateView();
      vscode.window.showInformationMessage(`Applied: ${suggestion.title}`);
      return;
    }

    const hasLm = await isLanguageModelAvailable();
    const hint = hasLm
      ? `Try it manually — ${suggestion.description}`
      : `This fix requires an AI model. Install GitHub Copilot Chat or use Cursor for AI-powered fixes.`;
    vscode.window.showInformationMessage(
      `Could not auto-apply "${suggestion.title}". ${hint}`
    );
  }

  private async generateAlternatives(): Promise<void> {
    if (!this.currentDiagramCode.trim()) {
      vscode.window.showInformationMessage("Open a .mmd file first.");
      return;
    }

    this.isGeneratingAlternatives = true;
    this.alternatives = [];
    this.updateView();

    const prompt = `You are a Mermaid diagram expert. Analyze this diagram and suggest 2-3 structural alternatives that could represent the same information more clearly or using a different diagram type.

Current diagram:
\`\`\`mermaid
${this.currentDiagramCode}
\`\`\`

For each alternative, respond in this EXACT JSON format (no other text):
[
  {
    "title": "short title",
    "description": "one sentence explaining why this structure is better",
    "code": "full mermaid diagram code"
  }
]`;

    const raw = await sendLanguageModelUserPrompt(
      prompt,
      "Generate structural alternatives for the current Mermaid diagram."
    );

    this.isGeneratingAlternatives = false;

    if (!raw) {
      const hasLm = await isLanguageModelAvailable();
      if (!hasLm) {
        vscode.window.showInformationMessage(
          "AI alternatives require a language model. Install GitHub Copilot Chat or use Cursor."
        );
      }
      this.updateView();
      return;
    }

    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("no json");
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ title: string; description: string; code: string }>;
      this.alternatives = parsed.map((item, i) => {
        let code = item.code;
        const fenced = code.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
        if (fenced) code = fenced[1].trim();
        return {
          id: `alt-${i}`,
          title: item.title,
          description: item.description,
          code,
        };
      });
    } catch {
      this.alternatives = [];
    }

    this.updateView();
  }

  private async applyAlternative(altId: string): Promise<void> {
    const alt = this.alternatives.find((a) => a.id === altId);
    if (!alt) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    await this.replaceDocumentContent(editor, alt.code);
    this.alternatives = [];
    vscode.window.showInformationMessage(`Applied: ${alt.title}`);
    await this.analyzeCurrent();
  }

  private async replaceDocumentContent(editor: vscode.TextEditor, newContent: string): Promise<void> {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, fullRange, newContent);
    await vscode.workspace.applyEdit(edit);
  }

  private async tryLlmApply(suggestion: DiagramSuggestionItem, code: string): Promise<string | undefined> {
    const prompt = `You are a Mermaid diagram expert. Apply the following improvement to the diagram:

Improvement: ${suggestion.title} — ${suggestion.description}

Current diagram:
\`\`\`mermaid
${code}
\`\`\`

Return ONLY the improved Mermaid diagram code (no explanation, no fences):`;

    const result = await sendLanguageModelUserPrompt(
      prompt,
      "Apply a diagram improvement from the Mermaid Chart suggestions panel."
    );
    if (!result) return undefined;
    const fenced = result.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
    return fenced ? fenced[1].trim() : result.trim();
  }

  private updateView(): void {
    if (!this.view) return;
    this.view.webview.html = this.getHtml();
  }

  /** Detects the diagram type keyword from the code for the thumbnail label. */
  private detectDiagramType(code: string): string {
    const match = code.match(
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|mindmap|gitGraph|architecture|journey|sankey|timeline|block-beta|xychart-beta|quadrantChart|requirement|C4Context|C4Container|C4Component|C4Deployment|packet-beta|kanban|zenuml)\b/im
    );
    if (!match) return "Diagram";
    const type = match[1].toLowerCase();
    const labels: Record<string, string> = {
      flowchart: "Flowchart",
      graph: "Flowchart",
      sequencediagram: "Sequence",
      classdiagram: "Class",
      erdiagram: "ER",
      "statediagram-v2": "State",
      statediagram: "State",
      gantt: "Gantt",
      pie: "Pie",
      mindmap: "Mindmap",
      gitgraph: "Git graph",
      architecture: "Architecture",
      journey: "Journey",
      sankey: "Sankey",
      timeline: "Timeline",
      "block-beta": "Block",
      "xychart-beta": "XY chart",
      quadrantchart: "Quadrant",
      requirement: "Requirement",
      "packet-beta": "Packet",
      kanban: "Kanban",
      zenuml: "ZenUML",
    };
    return labels[type] ?? "Diagram";
  }

  private getHtml(): string {
    const nonce = createWebviewNonce();
    const webview = this.view!.webview;
    const csp = webview.cspSource;

    const fontUrl = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "recursive-latin-full-normal.woff2")
    );
    const mermaidBundleUrl = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist-sidebar", "mermaid.js")
    );

    const hasDiagram = this.currentDiagramCode.trim().length > 0;
    const diagramType = hasDiagram ? this.detectDiagramType(this.currentDiagramCode) : "";
    const escapedCode = hasDiagram
      ? this.currentDiagramCode.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$")
      : "";

    const categoryLabels: Record<string, string> = {
      style: "Style",
      structure: "Structure",
      readability: "Readability",
      "best-practice": "Best practice",
    };

    const suggestionsHtml =
      this.suggestions.length === 0
        ? `<div class="empty-state">
             <svg class="empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none">
               <path d="M9 17H15M12 3C7.58 3 4 6.58 4 11C4 13.12 4.83 15.04 6.17 16.43C6.69 16.98 7 17.71 7 18.5V19C7 20.1 7.9 21 9 21H15C16.1 21 17 20.1 17 19V18.5C17 17.71 17.31 16.98 17.83 16.43C19.17 15.04 20 13.12 20 11C20 6.58 16.42 3 12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
             </svg>
             <p class="empty-title">No suggestions</p>
             <p class="empty-desc">Open a <code>.mmd</code> file to analyze.</p>
             <button type="button" class="text-btn" id="btnSuggestionsEmptyRefresh">Analyze current file</button>
           </div>`
        : `<div class="list">${this.suggestions
            .map(
              (s, i) => `
            <div class="suggestion${i < this.suggestions.length - 1 ? " has-sep" : ""}">
              <div class="suggestion-header">
                <span class="suggestion-cat">${escapeHtmlAttr(categoryLabels[s.category] ?? s.category)}</span>
                <span class="suggestion-pri pri-${s.priority}">${escapeHtmlAttr(s.priority)}</span>
              </div>
              <p class="suggestion-title">${escapeHtmlAttr(s.title)}</p>
              <p class="suggestion-desc">${escapeHtmlAttr(s.description)}</p>
              <button type="button" class="apply-btn suggestion-apply" data-id="${escapeHtmlAttr(s.id)}">Apply</button>
            </div>`
            )
            .join("")}</div>`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; img-src ${csp} https: data:; font-src ${csp}; script-src 'nonce-${nonce}' ${csp}; connect-src https:;">
<style nonce="${nonce}">
  @font-face {
    font-family: "Recursive";
    src: url("${fontUrl}") format("woff2");
    font-weight: 300 900;
    font-style: normal;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Recursive", var(--vscode-font-family), system-ui, sans-serif;
    color: var(--vscode-foreground);
    padding: 12px 14px;
    line-height: 1.5;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .toolbar-left {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .toolbar-title {
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.45;
  }
  .toolbar-count {
    font-size: 11px;
    font-weight: 500;
    opacity: 0.35;
  }
  .text-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground, #3794ff);
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
  }
  .text-btn:hover { text-decoration: underline; }

  /* ── Diagram thumbnail ── */
  .thumbnail-card {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.08));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.14));
    border-radius: 5px;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .thumbnail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.10));
  }
  .thumbnail-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.4;
  }
  .thumbnail-type {
    font-size: 10px;
    font-weight: 500;
    opacity: 0.35;
    text-transform: none;
    letter-spacing: 0;
  }
  .thumbnail-body {
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    max-height: 200px;
    overflow: hidden;
  }
  .thumbnail-body svg {
    max-width: 100%;
    max-height: 180px;
    height: auto;
  }
  .thumbnail-loading {
    font-size: 11px;
    opacity: 0.3;
    font-style: italic;
  }
  .thumbnail-error {
    font-size: 11px;
    opacity: 0.25;
  }

  /* ── Empty state ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 16px 24px;
    gap: 6px;
  }
  .empty-icon {
    opacity: 0.15;
    margin-bottom: 6px;
  }
  .empty-title {
    font-size: 13px;
    font-weight: 550;
    opacity: 0.5;
  }
  .empty-desc {
    font-size: 12px;
    opacity: 0.35;
    line-height: 1.5;
  }
  .empty-desc code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
    padding: 1px 5px;
    border-radius: 3px;
  }
  .empty-state .text-btn {
    margin-top: 10px;
    font-size: 12px;
  }

  /* ── Suggestion list ── */
  .list { display: flex; flex-direction: column; }

  .suggestion { padding: 10px 0; }
  .suggestion.has-sep {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.10));
  }

  .suggestion-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .suggestion-cat {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.35;
  }
  .suggestion-pri {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .pri-high {
    color: var(--vscode-errorForeground, #f48771);
    background: rgba(244,135,113,0.08);
  }
  .pri-medium {
    color: var(--vscode-editorWarning-foreground, #cca700);
    background: rgba(204,167,0,0.06);
  }
  .pri-low { opacity: 0.4; }

  .suggestion-title {
    font-size: 13px;
    font-weight: 550;
    line-height: 1.35;
    margin-bottom: 2px;
  }
  .suggestion-desc {
    font-size: 12px;
    opacity: 0.5;
    line-height: 1.45;
    margin-bottom: 8px;
  }

  .apply-btn {
    background: none;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    color: var(--vscode-foreground);
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 14px;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .apply-btn:hover {
    border-color: var(--vscode-focusBorder, #007fd4);
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.05));
  }

  /* ── Alternatives section ── */
  .section-divider {
    height: 1px;
    background: var(--vscode-panel-border, rgba(128,128,128,0.10));
    margin: 14px 0;
  }
  .alt-hint {
    font-size: 12px;
    opacity: 0.35;
    line-height: 1.45;
  }
  .alt-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
  }
  .alt-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
    border-top-color: var(--vscode-textLink-foreground, #3794ff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .alt-loading-text {
    font-size: 12px;
    opacity: 0.4;
    font-style: italic;
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="toolbar-title">Suggestions</span>
      ${this.suggestions.length > 0 ? `<span class="toolbar-count">${this.suggestions.length}</span>` : ""}
    </div>
    <button type="button" class="text-btn" id="btnToolbarRefresh">Refresh</button>
  </div>

  ${hasDiagram ? `
  <div class="thumbnail-card">
    <div class="thumbnail-header">
      <span class="thumbnail-label">Preview</span>
      <span class="thumbnail-type">${escapeHtmlAttr(diagramType)}</span>
    </div>
    <div class="thumbnail-body" id="diagramThumbnail">
      <span class="thumbnail-loading">Rendering…</span>
    </div>
  </div>` : ""}

  ${suggestionsHtml}

  ${hasDiagram ? `
  <div class="section-divider"></div>
  <div class="alt-section">
    <div class="toolbar" style="margin-bottom: 10px;">
      <div class="toolbar-left">
        <span class="toolbar-title">Alternatives</span>
        ${this.alternatives.length > 0 ? `<span class="toolbar-count">${this.alternatives.length}</span>` : ""}
      </div>
      <button type="button" class="text-btn" id="btnGenerateAlts">${this.isGeneratingAlternatives ? "Generating…" : "Generate"}</button>
    </div>
    ${this.isGeneratingAlternatives
      ? `<div class="alt-loading"><div class="alt-spinner"></div><span class="alt-loading-text">Analyzing structure…</span></div>`
      : this.alternatives.length === 0
        ? `<p class="alt-hint">Suggest structural alternatives using AI.</p>`
        : `<div class="list">${this.alternatives.map((a, i) => `
          <div class="suggestion${i < this.alternatives.length - 1 ? " has-sep" : ""}">
            <p class="suggestion-title">${escapeHtmlAttr(a.title)}</p>
            <p class="suggestion-desc">${escapeHtmlAttr(a.description)}</p>
            <button type="button" class="apply-btn alt-apply" data-id="${escapeHtmlAttr(a.id)}">Apply</button>
          </div>`).join("")}</div>`}
  </div>` : ""}

  ${hasDiagram ? `<script nonce="${nonce}" src="${mermaidBundleUrl}"></script>` : ""}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function wire(id, msg) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => vscode.postMessage(msg));
    }
    wire('btnToolbarRefresh', { type: 'refresh' });
    wire('btnSuggestionsEmptyRefresh', { type: 'refresh' });
    wire('btnGenerateAlts', { type: 'generateAlternatives' });

    document.body.addEventListener('click', (e) => {
      var btn = e.target && e.target.closest && e.target.closest('.suggestion-apply');
      if (btn && btn.dataset && btn.dataset.id) {
        vscode.postMessage({ type: 'applySuggestion', id: btn.dataset.id });
        return;
      }
      var altBtn = e.target && e.target.closest && e.target.closest('.alt-apply');
      if (altBtn && altBtn.dataset && altBtn.dataset.id) {
        vscode.postMessage({ type: 'applyAlternative', id: altBtn.dataset.id });
      }
    });

    ${hasDiagram ? `
    (async function renderThumbnail() {
      const container = document.getElementById('diagramThumbnail');
      if (!container) return;
      if (typeof sidebarMermaid === 'undefined') {
        container.innerHTML = '<span class="thumbnail-error">Preview unavailable</span>';
        return;
      }
      try {
        const code = \`${escapedCode}\`;
        const svg = await sidebarMermaid.render(code, 'thumb-' + Date.now());
        if (svg) {
          container.innerHTML = svg;
        } else {
          container.innerHTML = '<span class="thumbnail-error">Could not render</span>';
        }
      } catch (err) {
        container.innerHTML = '<span class="thumbnail-error">Parse error</span>';
      }
    })();` : ""}
  </script>
</body>
</html>`;
  }
}

/**
 * Opens diagram suggestions in a full editor tab (webview panel) similar to
 * the diagram-type picker. Reads the active editor's code, analyses it, and
 * shows actionable suggestions with a live thumbnail.
 */
export async function showSuggestionsTab(extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("Open a .mmd or .mermaid file first.");
    return;
  }
  const doc = editor.document;
  if (!canOpenMermaidPreview(doc)) {
    vscode.window.showInformationMessage("Diagram Suggestions are only available for Mermaid files.");
    return;
  }

  const code = doc.getText();
  const suggestions = analyzeForSuggestions(code);
  const diagramType = detectDiagramLabel(code);
  const escapedCode = code.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  const panel = vscode.window.createWebviewPanel(
    "mermaidSuggestionsTab",
    "Diagram Suggestions",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    {
      enableScripts: true,
      localResourceRoots: [extensionUri],
      retainContextWhenHidden: false,
    }
  );

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "applySuggestion") {
      const suggestion = suggestions.find((s) => s.id === msg.id);
      if (!suggestion) { return; }
      const ruleResult = applyRuleBasedFix(msg.id, editor.document.getText());
      if (ruleResult) {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(editor.document.uri, fullRange, ruleResult);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Applied: ${suggestion.title}`);
        panel.dispose();
        await showSuggestionsTab(extensionUri);
        return;
      }
      const llmResult = await tryLlmApplyStandalone(suggestion, editor.document.getText());
      if (llmResult) {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(editor.document.uri, fullRange, llmResult);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Applied: ${suggestion.title}`);
        panel.dispose();
        await showSuggestionsTab(extensionUri);
      } else {
        const hasLm = await isLanguageModelAvailable();
        const hint = hasLm
          ? `Try it manually — ${suggestion.description}`
          : "This fix requires an AI model. Install GitHub Copilot Chat or use Cursor.";
        vscode.window.showInformationMessage(`Could not auto-apply "${suggestion.title}". ${hint}`);
      }
    } else if (msg.type === "generateAlternatives") {
      panel.webview.postMessage({ type: "altLoading" });
      const alts = await generateAlternativesStandalone(code);
      panel.webview.postMessage({ type: "altResults", alternatives: alts });
    } else if (msg.type === "applyAlternative" && msg.code) {
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(editor.document.uri, fullRange, msg.code);
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(`Applied alternative diagram.`);
      panel.dispose();
      await showSuggestionsTab(extensionUri);
    } else if (msg.type === "close") {
      panel.dispose();
    }
  });

  panel.webview.html = getSuggestionsTabHtml(
    panel.webview,
    extensionUri,
    suggestions,
    diagramType,
    escapedCode
  );
}

async function tryLlmApplyStandalone(
  suggestion: DiagramSuggestionItem,
  code: string
): Promise<string | undefined> {
  const prompt = `You are a Mermaid diagram expert. Apply the following improvement to the diagram:

Improvement: ${suggestion.title} — ${suggestion.description}

Current diagram:
\`\`\`mermaid
${code}
\`\`\`

Return ONLY the improved Mermaid diagram code (no explanation, no fences):`;

  const result = await sendLanguageModelUserPrompt(
    prompt,
    "Apply a diagram improvement from the Mermaid Chart suggestions panel."
  );
  if (!result) { return undefined; }
  const fenced = result.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : result.trim();
}

async function generateAlternativesStandalone(
  code: string
): Promise<AlternativeItem[]> {
  const prompt = `You are a Mermaid diagram expert. Analyze this diagram and suggest 2-3 structural alternatives that could represent the same information more clearly or using a different diagram type.

Current diagram:
\`\`\`mermaid
${code}
\`\`\`

For each alternative, respond in this EXACT JSON format (no other text):
[
  {
    "title": "short title",
    "description": "one sentence explaining why this structure is better",
    "code": "full mermaid diagram code"
  }
]`;

  const raw = await sendLanguageModelUserPrompt(
    prompt,
    "Generate structural alternatives for the current Mermaid diagram."
  );
  if (!raw) { return []; }
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { return []; }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ title: string; description: string; code: string }>;
    return parsed.map((item, i) => {
      let c = item.code;
      const fenced = c.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
      if (fenced) { c = fenced[1].trim(); }
      return { id: `alt-${i}`, title: item.title, description: item.description, code: c };
    });
  } catch {
    return [];
  }
}

function detectDiagramLabel(code: string): string {
  const match = code.match(
    /^\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|mindmap|gitGraph|architecture|journey|sankey|timeline|block-beta|xychart-beta|quadrantChart|requirement|packet-beta|kanban|zenuml)\b/im
  );
  if (!match) { return "Diagram"; }
  const type = match[1].toLowerCase();
  const labels: Record<string, string> = {
    flowchart: "Flowchart", graph: "Flowchart", sequencediagram: "Sequence",
    classdiagram: "Class", erdiagram: "ER", "statediagram-v2": "State",
    statediagram: "State", gantt: "Gantt", pie: "Pie", mindmap: "Mindmap",
    gitgraph: "Git graph", architecture: "Architecture", journey: "Journey",
    sankey: "Sankey", timeline: "Timeline", "block-beta": "Block",
    "xychart-beta": "XY chart", quadrantchart: "Quadrant",
    requirement: "Requirement", "packet-beta": "Packet", kanban: "Kanban",
    zenuml: "ZenUML",
  };
  return labels[type] ?? "Diagram";
}

function getSuggestionsTabHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  suggestions: DiagramSuggestionItem[],
  diagramType: string,
  escapedCode: string
): string {
  const nonce = createWebviewNonce();
  const csp = webview.cspSource;

  const fontUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "recursive-latin-full-normal.woff2")
  );
  const mermaidUrl = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist-sidebar", "mermaid.js")
  );

  const categoryLabels: Record<string, string> = {
    style: "Style", structure: "Structure", readability: "Readability",
    "best-practice": "Best practice",
  };

  const suggestionsHtml = suggestions.length === 0
    ? `<div class="empty-block">
         <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="opacity:0.18;margin-bottom:8px">
           <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>
         <p style="font-size:13px;font-weight:550;opacity:0.45">No suggestions</p>
         <p style="font-size:12px;opacity:0.3">This diagram looks good!</p>
       </div>`
    : suggestions.map((s, i) => {
        const needsAI = s.autoFixable === false;
        const btnLabel = needsAI ? "AI only" : "Apply";
        const btnClass = needsAI ? "apply-chip ai-chip" : "apply-chip";
        return `
        <div class="row suggestion-row" data-id="${escapeHtmlAttr(s.id)}">
          <div class="row-info">
            <div class="row-top">
              <span class="row-label">${escapeHtmlAttr(s.title)}</span>
              <span class="badge badge-${s.priority}">${escapeHtmlAttr(s.priority)}</span>
              <span class="cat-label">${escapeHtmlAttr(categoryLabels[s.category] ?? s.category)}</span>
            </div>
            <span class="row-desc">${escapeHtmlAttr(s.description)}</span>
          </div>
          <span class="${btnClass}" data-id="${escapeHtmlAttr(s.id)}">${btnLabel}</span>
        </div>${i < suggestions.length - 1 ? '<div class="separator"></div>' : ""}`;
      }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; img-src ${csp} https: data:; font-src ${csp}; script-src 'nonce-${nonce}' ${csp}; connect-src https:;">
<style nonce="${nonce}">
  @font-face {
    font-family: "Recursive";
    src: url("${fontUrl}") format("woff2");
    font-weight: 300 900;
    font-style: normal;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Recursive", var(--vscode-font-family), system-ui, sans-serif;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 28px 28px;
    line-height: 1.5;
    max-width: 620px;
    margin: 0 auto;
  }

  .header { margin-bottom: 20px; }
  .header-title { font-size: 15px; font-weight: 600; letter-spacing: -0.15px; margin-bottom: 2px; }
  .header-sub { font-size: 12px; opacity: 0.45; font-weight: 400; }

  .thumbnail-card {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.08));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.14));
    border-radius: 6px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .thumbnail-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.10));
  }
  .thumbnail-label { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.4; }
  .thumbnail-type { font-size: 10px; font-weight: 500; opacity: 0.35; }
  .thumbnail-body {
    padding: 12px;
    display: flex; align-items: center; justify-content: center;
    min-height: 80px; max-height: 220px; overflow: hidden;
  }
  .thumbnail-body svg { max-width: 100%; max-height: 200px; height: auto; }
  .thumbnail-loading { font-size: 11px; opacity: 0.3; font-style: italic; }
  .thumbnail-error { font-size: 11px; opacity: 0.25; }

  .section-title {
    font-size: 11px; font-weight: 650; letter-spacing: 0.05em;
    text-transform: uppercase; opacity: 0.35; margin-bottom: 10px;
    display: flex; align-items: center; gap: 6px;
  }
  .section-count { font-weight: 500; opacity: 0.6; }

  .row {
    display: flex; align-items: center; gap: 14px;
    padding: 10px 8px; cursor: pointer; transition: background 0.12s;
    border-radius: 4px;
  }
  .row:hover { background: rgba(255,255,255,0.04); }
  .row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .row-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .row-label { font-size: 13px; font-weight: 550; }
  .row-desc { font-size: 11px; opacity: 0.45; line-height: 1.45; }

  .badge {
    font-size: 9px; font-weight: 700; letter-spacing: 0.4px;
    text-transform: uppercase; padding: 1px 7px; border-radius: 3px; flex-shrink: 0;
  }
  .badge-high { color: var(--vscode-errorForeground, #f48771); background: rgba(244,135,113,0.1); }
  .badge-medium { color: var(--vscode-editorWarning-foreground, #cca700); background: rgba(204,167,0,0.08); }
  .badge-low { opacity: 0.5; background: rgba(128,128,128,0.08); }

  .cat-label { font-size: 9px; font-weight: 500; opacity: 0.35; text-transform: uppercase; letter-spacing: 0.03em; }

  .apply-chip {
    flex-shrink: 0;
    font-size: 11px; font-weight: 500;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    color: var(--vscode-foreground);
    padding: 3px 14px; border-radius: 4px; cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .apply-chip:hover {
    border-color: var(--vscode-focusBorder, #007fd4);
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.05));
  }
  .ai-chip {
    opacity: 0.4;
    font-style: italic;
    cursor: default;
  }
  .ai-chip:hover {
    border-color: var(--vscode-panel-border, rgba(128,128,128,0.18));
    background: none;
  }

  .separator { height: 1px; background: rgba(255,255,255,0.06); width: 100%; }

  .alt-section { margin-top: 24px; }
  .gen-btn {
    background: none; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    color: var(--vscode-textLink-foreground, #3794ff);
    font-family: inherit; font-size: 12px; font-weight: 500;
    padding: 5px 16px; border-radius: 4px; cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .gen-btn:hover { border-color: var(--vscode-focusBorder, #007fd4); background: rgba(55,148,255,0.06); }

  .alt-loading { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
  .alt-spinner {
    width: 14px; height: 14px;
    border: 2px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
    border-top-color: var(--vscode-textLink-foreground, #3794ff);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .alt-loading-text { font-size: 12px; opacity: 0.4; font-style: italic; }
  .alt-hint { font-size: 12px; opacity: 0.3; line-height: 1.45; margin-top: 4px; }

  .empty-block { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px; gap: 4px; }

  #altList { margin-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-title">Diagram Suggestions</div>
    <div class="header-sub">Improvements for your ${escapeHtmlAttr(diagramType)} diagram</div>
  </div>

  <div class="thumbnail-card">
    <div class="thumbnail-header">
      <span class="thumbnail-label">Current diagram</span>
      <span class="thumbnail-type">${escapeHtmlAttr(diagramType)}</span>
    </div>
    <div class="thumbnail-body" id="diagramThumbnail">
      <span class="thumbnail-loading">Rendering…</span>
    </div>
  </div>

  <div class="section-title">
    Suggestions
    ${suggestions.length > 0 ? `<span class="section-count">${suggestions.length}</span>` : ""}
  </div>
  ${suggestionsHtml}

  <div class="alt-section">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span class="section-title" style="margin-bottom:0">Alternatives</span>
      <button type="button" class="gen-btn" id="btnGenerateAlts">Generate with AI</button>
    </div>
    <p class="alt-hint" id="altHint">Suggest structural alternatives using AI.</p>
    <div id="altLoading" style="display:none"><div class="alt-loading"><div class="alt-spinner"></div><span class="alt-loading-text">Analysing structure…</span></div></div>
    <div id="altList"></div>
  </div>

  <script nonce="${nonce}" src="${mermaidUrl}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.apply-chip').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'applySuggestion', id: el.dataset.id });
      });
    });
    document.querySelectorAll('.suggestion-row').forEach(function(el) {
      el.addEventListener('click', function() {
        vscode.postMessage({ type: 'applySuggestion', id: el.dataset.id });
      });
    });

    var btnGen = document.getElementById('btnGenerateAlts');
    if (btnGen) btnGen.addEventListener('click', function() {
      vscode.postMessage({ type: 'generateAlternatives' });
    });

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'altLoading') {
        var hint = document.getElementById('altHint');
        if (hint) hint.style.display = 'none';
        var loading = document.getElementById('altLoading');
        if (loading) loading.style.display = 'block';
        var list = document.getElementById('altList');
        if (list) list.innerHTML = '';
      } else if (msg.type === 'altResults') {
        var loading = document.getElementById('altLoading');
        if (loading) loading.style.display = 'none';
        var list = document.getElementById('altList');
        if (!list) return;
        var alts = msg.alternatives || [];
        if (alts.length === 0) {
          list.innerHTML = '<p class="alt-hint">No alternatives generated. Try again.</p>';
          return;
        }
        list.innerHTML = alts.map(function(a, i) {
          return '<div class="row" style="cursor:pointer" data-alt-idx="' + i + '">' +
            '<div class="row-info"><span class="row-label">' + escapeHtml(a.title) + '</span>' +
            '<span class="row-desc">' + escapeHtml(a.description) + '</span></div>' +
            '<span class="apply-chip alt-apply" data-alt-idx="' + i + '">Apply</span></div>' +
            (i < alts.length - 1 ? '<div class="separator"></div>' : '');
        }).join('');
        list.querySelectorAll('.alt-apply').forEach(function(btn) {
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var idx = parseInt(btn.dataset.altIdx);
            vscode.postMessage({ type: 'applyAlternative', code: alts[idx].code });
          });
        });
        list.querySelectorAll('[data-alt-idx]').forEach(function(row) {
          if (!row.classList.contains('alt-apply')) {
            row.addEventListener('click', function() {
              var idx = parseInt(row.dataset.altIdx);
              vscode.postMessage({ type: 'applyAlternative', code: alts[idx].code });
            });
          }
        });
      }
    });

    function escapeHtml(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    (async function renderThumbnail() {
      var container = document.getElementById('diagramThumbnail');
      if (!container) return;
      if (typeof sidebarMermaid === 'undefined') {
        container.innerHTML = '<span class="thumbnail-error">Preview unavailable</span>';
        return;
      }
      try {
        var code = \`${escapedCode}\`;
        var svg = await sidebarMermaid.render(code, 'thumb-' + Date.now());
        if (svg) { container.innerHTML = svg; }
        else { container.innerHTML = '<span class="thumbnail-error">Could not render</span>'; }
      } catch (err) {
        container.innerHTML = '<span class="thumbnail-error">Parse error</span>';
      }
    })();
  </script>
</body>
</html>`;
}

function applyRuleBasedFix(id: string, code: string): string | undefined {
  const lines = code.split("\n");

  switch (id) {
    case "add-direction": {
      return code.replace(/^(flowchart)\s*$/m, "$1 TD")
                 .replace(/^(graph)\s*$/m, "$1 TD");
    }

    case "add-comments": {
      const frontmatterEnd = code.indexOf("---", code.indexOf("---") + 3);
      if (frontmatterEnd !== -1) {
        const insertPos = frontmatterEnd + 3;
        return code.slice(0, insertPos) + "\n\n%% Diagram overview\n%% TODO: describe what this diagram represents" + code.slice(insertPos);
      }
      const firstDiagramLine = lines.findIndex(
        (l) => /^\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|gantt|pie|mindmap|gitGraph|architecture)/i.test(l)
      );
      if (firstDiagramLine >= 0) {
        lines.splice(firstDiagramLine, 0, "%% Diagram overview", "%% TODO: describe what this diagram represents", "");
        return lines.join("\n");
      }
      return "%% Diagram overview\n%% TODO: describe what this diagram represents\n" + code;
    }

    case "add-styling": {
      const styleBlock = [
        "",
        "    %% Styles",
        "    classDef primary fill:#4F46E5,stroke:#3730A3,color:#fff",
        "    classDef secondary fill:#059669,stroke:#047857,color:#fff",
        "    classDef accent fill:#D97706,stroke:#B45309,color:#fff",
      ].join("\n");
      return code + styleBlock;
    }

    case "add-edge-labels": {
      return undefined;
    }

    case "split-subgraphs": {
      return splitIntoSubgraphs(code);
    }

    case "wrap-long-lines": {
      const wrapped = lines.map((line) => {
        if (line.length <= 120) return line;
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        return line.replace(/(\s*(?:-->|==>|-.->|--\>|---|~~~)\s*)/g, `\n${indent}    $1`);
      });
      return wrapped.join("\n");
    }

    case "class-add-methods": {
      return code.replace(
        /(\bclass\s+\w+\s*\{)((?:\s*[+\-#~]?\w[^(}\n]*\n)*?)(\s*\})/g,
        (match, open: string, body: string, close: string) => {
          if (/\w+\(/.test(body)) { return match; }
          const indent = body.match(/^(\s+)/m)?.[1] ?? "    ";
          return open + body.replace(/\n(\s*\})/, `\n${indent}+toString()\n$1`) + close;
        }
      );
    }

    case "class-add-visibility": {
      return code.replace(
        /^(\s+)(\w[\w<>\[\], ]*(?::\s*\w[\w<>\[\], ]*)?)$/gm,
        (match, indent: string, field: string) => {
          if (/^[+\-#~]/.test(field.trim())) { return match; }
          if (/^\s*(class\s|<<|%%|\}|$)/.test(match)) { return match; }
          return `${indent}+${field.trim()}`;
        }
      );
    }

    case "class-add-relationships": {
      const classNames = [...code.matchAll(/\bclass\s+(\w+)/g)].map((m) => m[1]);
      if (classNames.length < 2) { return undefined; }
      const relLines = [
        "",
        "%% TODO: define relationships between classes",
      ];
      for (let i = 0; i < classNames.length - 1; i++) {
        relLines.push(`${classNames[i]} --> ${classNames[i + 1]}`);
      }
      return code + relLines.join("\n") + "\n";
    }

    case "class-add-stereotypes": {
      return code.replace(
        /^(\s*)(class\s+(\w+)\s*\{)/gm,
        (match, indent: string, full: string, name: string) => {
          if (code.includes(`<<`) && code.includes(`>>`)) { return match; }
          return `${indent}${full}`;
        }
      ).replace(
        /^(\s*)(class\s+(\w+)\s*)$/gm,
        (match, indent: string, decl: string, name: string) => {
          return `${indent}${decl}\n${indent}<<class>>`;
        }
      );
    }

    case "class-add-namespaces": {
      const classMatches = [...code.matchAll(/\bclass\s+(\w+)/g)].map((m) => m[1]);
      if (classMatches.length < 4) { return undefined; }
      const half = Math.ceil(classMatches.length / 2);
      const group1 = classMatches.slice(0, half);
      const group2 = classMatches.slice(half);
      const nsBlock = [
        "",
        "namespace Core {",
        ...group1.map((c) => `    class ${c}`),
        "}",
        "namespace Services {",
        ...group2.map((c) => `    class ${c}`),
        "}",
      ];
      return code + "\n" + nsBlock.join("\n") + "\n";
    }

    case "seq-add-activation": {
      return code.replace(
        /^(\s*(\w+)\s*->>(\+?)\s*(\w+)\s*:.*)$/gm,
        (match, full: string, from: string, plus: string, to: string) => {
          if (plus) { return match; }
          return full.replace(`${from}->>`, `${from}->>+`);
        }
      );
    }

    case "seq-add-fragments": {
      const lastLine = lines[lines.length - 1];
      const indent = lastLine.match(/^(\s*)/)?.[1] ?? "    ";
      return code + `\n${indent}alt Success\n${indent}    %% TODO: add success path\n${indent}else Failure\n${indent}    %% TODO: add failure path\n${indent}end\n`;
    }

    case "seq-add-notes": {
      const participants = [...code.matchAll(/\bparticipant\s+(\w+)/g)].map((m) => m[1]);
      const target = participants[0] ?? "Actor";
      return code + `\n    Note over ${target}: TODO: add note\n`;
    }

    case "er-add-cardinality": {
      return code.replace(
        /^(\s*\w+)\s*--\s*(\w+)/gm,
        "$1 ||--o{ $2"
      );
    }

    case "er-add-labels": {
      return code.replace(
        /^(\s*\w+\s*\|\|--o\{\s*\w+)\s*$/gm,
        "$1 : relates"
      ).replace(
        /^(\s*\w+\s*--\s*\w+)\s*$/gm,
        "$1 : relates"
      );
    }

    case "state-add-labels": {
      return code.replace(
        /^(\s*\w+\s*)-->\s*(\w+)\s*$/gm,
        "$1--> $2 : event"
      );
    }

    case "state-add-composite": {
      const stateNames = [...code.matchAll(/^\s*(\w+)\s*-->/gm)].map((m) => m[1]);
      const unique = [...new Set(stateNames)];
      if (unique.length < 3) { return undefined; }
      const half = Math.ceil(unique.length / 2);
      const grouped = unique.slice(0, half);
      return code + `\n    state "Group" as composite {\n${grouped.map((s) => `        ${s}`).join("\n")}\n    }\n`;
    }

    case "gantt-add-sections": {
      const taskLines = lines.filter((l) => /^\s+\w/.test(l) && !/^\s*(dateFormat|title|axisFormat|section)\b/.test(l));
      if (taskLines.length === 0) { return undefined; }
      const insertIdx = lines.findIndex((l) => /^\s+\w/.test(l) && !/^\s*(dateFormat|title|axisFormat)\b/.test(l));
      if (insertIdx >= 0) {
        lines.splice(insertIdx, 0, "    section Main");
        return lines.join("\n");
      }
      return undefined;
    }

    case "mindmap-add-depth": {
      const rootIdx = lines.findIndex((l) => /^\s{2,4}\S/.test(l));
      if (rootIdx === -1) { return undefined; }
      const lastContentIdx = lines.length - 1;
      const indent = "        ";
      lines.splice(lastContentIdx + 1, 0, `${indent}Sub-topic A`, `${indent}Sub-topic B`);
      return lines.join("\n");
    }

    default:
      return undefined;
  }
}

function splitIntoSubgraphs(code: string): string | undefined {
  const lines = code.split("\n");

  const headerIdx = lines.findIndex((l) =>
    /^\s*(flowchart|graph)\s*(TD|TB|BT|LR|RL)?\s*$/i.test(l.trim())
  );
  if (headerIdx === -1) return undefined;

  if (/^\s*subgraph\s/m.test(code)) return undefined;

  const headerLine = lines[headerIdx];
  const baseIndent = headerLine.match(/^(\s*)/)?.[1] ?? "";
  const inner = baseIndent + "    ";
  const innerInner = inner + "    ";

  const edgePattern = /^\s*(\w+)(?:\[.*?\]|\(.*?\)|\{.*?\}|".*?")?(?:\s*@\{.*?\})?\s*(-->|==>|-.->|---|-.-|~~~|--\s.*?\s-->|==\s.*?\s==>)\s*(\w+)/;
  const nodeDefPattern = /^\s*(\w+)(?:\[.*?\]|\(.*?\)|\{.*?\}|".*?")/;
  const skipPattern = /^\s*(?:%%|style\s|classDef\s|end\s*$|$|click\s)/;

  const edges: Array<{ from: string; to: string; line: string }> = [];
  const nodeDefs: Map<string, string> = new Map();
  const styleLines: string[] = [];
  const allNodeIds = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed === "end") continue;

    if (/^\s*(style\s|classDef\s|click\s|%%|linkStyle\s)/.test(line)) {
      styleLines.push(line);
      continue;
    }

    const edgeMatch = trimmed.match(edgePattern);
    if (edgeMatch) {
      const from = edgeMatch[1];
      const to = edgeMatch[3];
      allNodeIds.add(from);
      allNodeIds.add(to);
      edges.push({ from, to, line: trimmed });
      continue;
    }

    const multiMatch = trimmed.match(/^\s*(\w+)(?:\[.*?\]|\(.*?\)|\{.*?\}|".*?")?\s*(-->|==>)\s*(.+)/);
    if (multiMatch) {
      const from = multiMatch[1];
      allNodeIds.add(from);
      const targets = multiMatch[3].split(/\s*&\s*/);
      for (const t of targets) {
        const tid = t.trim().match(/^(\w+)/)?.[1];
        if (tid) {
          allNodeIds.add(tid);
          edges.push({ from, to: tid, line: trimmed });
        }
      }
      continue;
    }

    const defMatch = trimmed.match(nodeDefPattern);
    if (defMatch && !skipPattern.test(line)) {
      allNodeIds.add(defMatch[1]);
      nodeDefs.set(defMatch[1], trimmed);
    }
  }

  if (allNodeIds.size < 6) return undefined;

  const adj: Map<string, Set<string>> = new Map();
  for (const id of allNodeIds) adj.set(id, new Set());
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const hasIncoming = new Set<string>();
  for (const e of edges) hasIncoming.add(e.to);
  const roots = [...allNodeIds].filter((id) => !hasIncoming.has(id));
  if (roots.length === 0) roots.push([...allNodeIds][0]);

  const visited = new Set<string>();
  const clusters: Map<string, string[]> = new Map();

  for (const root of roots) {
    if (visited.has(root)) continue;
    const cluster: string[] = [];
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      cluster.push(node);
      const neighbors = adj.get(node) ?? new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    if (cluster.length > 0) {
      clusters.set(root, cluster);
    }
  }

  if (clusters.size <= 1 && allNodeIds.size >= 6) {
    clusters.clear();
    const root = roots[0];
    const depth: Map<string, number> = new Map();
    const bfsQueue: Array<{ node: string; d: number }> = [{ node: root, d: 0 }];
    const bfsVisited = new Set<string>();
    while (bfsQueue.length > 0) {
      const { node, d } = bfsQueue.shift()!;
      if (bfsVisited.has(node)) continue;
      bfsVisited.add(node);
      depth.set(node, d);
      for (const e of edges) {
        if (e.from === node && !bfsVisited.has(e.to)) {
          bfsQueue.push({ node: e.to, d: d + 1 });
        }
      }
    }
    for (const id of allNodeIds) {
      if (!depth.has(id)) depth.set(id, 999);
    }

    const grouped: Map<number, string[]> = new Map();
    for (const [node, d] of depth) {
      const bucket = Math.floor(d / 2);
      if (!grouped.has(bucket)) grouped.set(bucket, []);
      grouped.get(bucket)!.push(node);
    }

    let groupIdx = 0;
    for (const [, nodes] of [...grouped].sort((a, b) => a[0] - b[0])) {
      if (nodes.length > 0) {
        clusters.set(`group_${groupIdx}`, nodes);
        groupIdx++;
      }
    }
  }

  const outputLines: string[] = [headerLine];
  let subgraphIndex = 0;
  const clusterNames = ["Core", "Processing", "Services", "External", "Utilities", "Output", "Input", "Data"];

  for (const [, nodeIds] of clusters) {
    const name = clusterNames[subgraphIndex % clusterNames.length];
    outputLines.push(`${inner}subgraph ${name}`);

    for (const nodeId of nodeIds) {
      const def = nodeDefs.get(nodeId);
      if (def) {
        outputLines.push(`${innerInner}${def}`);
      }
    }

    const nodeSet = new Set(nodeIds);
    const emittedEdges = new Set<string>();
    for (const e of edges) {
      if (nodeSet.has(e.from) && nodeSet.has(e.to) && !emittedEdges.has(e.line)) {
        outputLines.push(`${innerInner}${e.line}`);
        emittedEdges.add(e.line);
      }
    }

    outputLines.push(`${inner}end`);
    subgraphIndex++;
  }

  outputLines.push("");
  outputLines.push(`${inner}%% Cross-group connections`);
  const clusterNodeSets: Set<string>[] = [];
  for (const [, nodeIds] of clusters) {
    clusterNodeSets.push(new Set(nodeIds));
  }
  const emittedCross = new Set<string>();
  for (const e of edges) {
    const sameCluster = clusterNodeSets.some((s) => s.has(e.from) && s.has(e.to));
    if (!sameCluster && !emittedCross.has(e.line)) {
      outputLines.push(`${inner}${e.line}`);
      emittedCross.add(e.line);
    }
  }

  if (styleLines.length > 0) {
    outputLines.push("");
    for (const sl of styleLines) {
      outputLines.push(sl);
    }
  }

  return outputLines.join("\n");
}

function detectDiagramKind(code: string): string | undefined {
  const m = code.match(
    /^\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|mindmap|gitGraph|architecture|journey|sankey|timeline|block-beta|xychart-beta|quadrantChart|requirement|packet-beta|kanban|zenuml)\b/im
  );
  return m?.[1]?.toLowerCase().replace("-v2", "");
}

function analyzeForSuggestions(code: string): DiagramSuggestionItem[] {
  const suggestions: DiagramSuggestionItem[] = [];
  const lines = code.split("\n");
  const kind = detectDiagramKind(code);

  if (!/%%.+/.test(code)) {
    suggestions.push({
      id: "add-comments",
      title: "Add documentation comments",
      description: "The diagram has no comments. Adding %% comments improves maintainability.",
      category: "readability",
      priority: "low",
    });
  }

  const longLines = lines.filter((l) => l.length > 120);
  if (longLines.length > 0) {
    suggestions.push({
      id: "wrap-long-lines",
      title: "Wrap long lines",
      description: `${longLines.length} line(s) exceed 120 characters. Break them up for readability.`,
      category: "readability",
      priority: "low",
    });
  }

  if (kind === "flowchart" || kind === "graph") {
    if (!/\bTD\b|\bLR\b|\bRL\b|\bBT\b/.test(code)) {
      suggestions.push({
        id: "add-direction",
        title: "Specify diagram direction",
        description: "No direction (TD/LR/RL/BT) specified. Adding a direction makes layout predictable.",
        category: "best-practice",
        priority: "medium",
      });
    }

    if (!/style\s|classDef\s|:::/.test(code)) {
      suggestions.push({
        id: "add-styling",
        title: "Add visual styling",
        description: "No styles detected. Adding colors and classes makes the diagram clearer.",
        category: "style",
        priority: "medium",
      });
    }

    const nodeCount = (code.match(/[A-Za-z_]\w*[\[\(\{\"]/g) || []).length;
    if (nodeCount > 15 && !/\bsubgraph\b/i.test(code)) {
      suggestions.push({
        id: "split-subgraphs",
        title: "Split into subgraphs",
        description: `Found ~${nodeCount} nodes. Group related nodes into subgraphs for clarity.`,
        category: "structure",
        priority: "high",
      });
    }

    if (/--->/g.test(code) && !/--\s*\w+\s*-->/.test(code)) {
      suggestions.push({
        id: "add-edge-labels",
        title: "Add edge labels",
        description: "Edges have no labels. Adding descriptive labels helps readers understand relationships.",
        category: "readability",
        priority: "medium",
        autoFixable: false,
      });
    }
  }

  if (kind === "classdiagram") {
    const classBlocks = code.match(/\bclass\s+\w+\s*\{[^}]*\}/gs) ?? [];
    const fieldOnly = classBlocks.filter((b) => !/\w+\(.*?\)/.test(b));
    if (fieldOnly.length > 0 && classBlocks.length > 1) {
      suggestions.push({
        id: "class-add-methods",
        title: "Add methods to classes",
        description: `${fieldOnly.length} class(es) have only fields. Adding key methods shows behaviour.`,
        category: "structure",
        priority: "medium",
      });
    }

    const fieldsNoVisibility = (code.match(/^\s+[\w:]+\s*$/gm) ?? []).length;
    if (fieldsNoVisibility > 2 && !/[+\-#~]/.test(code)) {
      suggestions.push({
        id: "class-add-visibility",
        title: "Add visibility modifiers",
        description: "Use +public, -private, #protected, ~package to clarify access levels.",
        category: "best-practice",
        priority: "medium",
      });
    }

    const relationships = (code.match(/<\|--|--\*|--o|--|\.\.>|<\.\./g) ?? []).length;
    const classCount = (code.match(/\bclass\s+\w+/g) ?? []).length;
    if (classCount > 2 && relationships === 0) {
      suggestions.push({
        id: "class-add-relationships",
        title: "Add relationships between classes",
        description: "Classes are defined but unconnected. Adding inheritance/association shows structure.",
        category: "structure",
        priority: "high",
      });
    }

    if (!/<<\w+>>/.test(code) && classCount > 3) {
      suggestions.push({
        id: "class-add-stereotypes",
        title: "Consider stereotypes or annotations",
        description: "Use <<interface>>, <<abstract>>, <<enumeration>> to clarify class roles.",
        category: "best-practice",
        priority: "low",
      });
    }

    if (!/\bnamespace\b/.test(code) && classCount > 6) {
      suggestions.push({
        id: "class-add-namespaces",
        title: "Group classes into namespaces",
        description: `${classCount} classes defined. Namespaces help organise large diagrams.`,
        category: "structure",
        priority: "medium",
      });
    }
  }

  if (kind === "sequencediagram") {
    if (!/\bactivate\b|\b\+\w/.test(code)) {
      const callCount = (code.match(/->>|-->>|->/g) ?? []).length;
      if (callCount > 2) {
        suggestions.push({
          id: "seq-add-activation",
          title: "Add activation bars",
          description: "Use activate/deactivate or +/- to show when participants are active.",
          category: "readability",
          priority: "medium",
        });
      }
    }

    if (!/\balt\b|\bopt\b|\bloop\b|\bpar\b|\bcritical\b/.test(code)) {
      suggestions.push({
        id: "seq-add-fragments",
        title: "Add interaction fragments",
        description: "Use alt/opt/loop/par blocks to show conditional or repeated behaviour.",
        category: "structure",
        priority: "medium",
      });
    }

    if (!/\bNote\b/.test(code)) {
      suggestions.push({
        id: "seq-add-notes",
        title: "Add notes",
        description: "Notes help explain non-obvious interactions between participants.",
        category: "readability",
        priority: "low",
      });
    }
  }

  if (kind === "erdiagram") {
    const rels = code.match(/\|\||\}o|\|o|o\{|o\||\}\||\|\{/g) ?? [];
    if (rels.length === 0 && /--/.test(code)) {
      suggestions.push({
        id: "er-add-cardinality",
        title: "Add cardinality notation",
        description: "Relationships use plain lines. Add ||, o{, |{ for one-to-many/many-to-many.",
        category: "best-practice",
        priority: "high",
      });
    }

    if (!/\s:\s/.test(code)) {
      suggestions.push({
        id: "er-add-labels",
        title: "Label relationships",
        description: "Add relationship labels (e.g. USER ||--o{ ORDER : places) for clarity.",
        category: "readability",
        priority: "medium",
      });
    }
  }

  if (kind === "statediagram") {
    if (!/:\s/.test(code) && /-->/.test(code)) {
      suggestions.push({
        id: "state-add-labels",
        title: "Label transitions",
        description: "Transitions have no labels. Add event/condition descriptions.",
        category: "readability",
        priority: "medium",
      });
    }

    if (!/\bstate\s+\w+\s*\{/.test(code)) {
      const stateCount = (code.match(/\b\w+\s*-->|\[\*\]\s*-->/g) ?? []).length;
      if (stateCount > 5) {
        suggestions.push({
          id: "state-add-composite",
          title: "Use composite states",
          description: "Group related states into composite states for better organisation.",
          category: "structure",
          priority: "medium",
        });
      }
    }
  }

  if (kind === "gantt") {
    if (!/\bsection\b/.test(code)) {
      suggestions.push({
        id: "gantt-add-sections",
        title: "Group tasks into sections",
        description: "Use section blocks to organise related tasks together.",
        category: "structure",
        priority: "medium",
      });
    }
  }

  if (kind === "mindmap") {
    const indentLevels = new Set(lines.map((l) => (l.match(/^(\s*)/)?.[1] ?? "").length));
    if (indentLevels.size <= 2) {
      suggestions.push({
        id: "mindmap-add-depth",
        title: "Add more depth levels",
        description: "The mindmap is shallow. Adding sub-topics gives a richer overview.",
        category: "structure",
        priority: "medium",
      });
    }
  }

  return suggestions;
}

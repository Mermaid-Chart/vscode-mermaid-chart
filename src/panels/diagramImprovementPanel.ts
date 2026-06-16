import * as path from "path";
import * as vscode from "vscode";
import { createWebviewNonce, escapeHtmlAttr } from "../templates/webviewHtmlHelpers";
import { DiagramImprovementDiffProvider } from "../diagramImprovementDiffProvider";
import {
  generateDiagramImprovements,
  type DiagramImprovementCard,
} from "../services/diagramImprovementService";
import {
  getCachedImprovements,
  setCachedImprovements,
  clearCachedImprovements,
} from "../services/diagramImprovementCache";
import {
  isLanguageModelCancellation,
  listAvailableChatModels,
  type LanguageModelInfo,
} from "../services/vscodeLanguageModel";
import { canOpenMermaidPreview, getActiveOrOpenMermaidDocument } from "../util";
import analytics from "../analytics";

const SELECTED_MODEL_STATE_KEY = "diagramImprovement.selectedModelId";

export class DiagramImprovementPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "mermaidImproveDiagram";

  private view?: vscode.WebviewView;
  private targetUri?: vscode.Uri;
  private baseContent = "";
  private diagramFileName = "";
  private cards: DiagramImprovementCard[] = [];
  private isLoading = false;
  private loadError = "";
  private providerLabel = "";
  private hasDiagramFile = false;
  private availableModels: LanguageModelInfo[] = [];
  private selectedModelId = "";
  private activeCancelSource?: vscode.CancellationTokenSource;
  private activeGenerationKey?: string;
  /** URIs with an in-flight LLM request (sidebar may show another file meanwhile). */
  private readonly generatingUris = new Set<string>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffProvider: DiagramImprovementDiffProvider,
    private readonly extensionContext: vscode.ExtensionContext
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    void this.refreshModels().then(() => {
      this.syncToActiveDiagram();
      this.render();
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "refresh" || msg.type === "generate") {
        analytics.trackImproveDiagramInvoked();
        await this.runGeneration(true);
      } else if (msg.type === "openCard" && typeof msg.id === "string") {
        await this.openCardDiff(msg.id);
      } else if (msg.type === "setModel" && typeof msg.modelId === "string") {
        this.selectedModelId = msg.modelId;
        void this.extensionContext.globalState.update(SELECTED_MODEL_STATE_KEY, msg.modelId);
      } else if (msg.type === "cancel") {
        this.cancelActiveGeneration();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refreshModels().then(() => {
          this.syncToActiveDiagram();
          this.render();
        });
      }
    });
  }

  private async refreshModels(): Promise<void> {
    this.availableModels = await listAvailableChatModels();
    const saved = this.extensionContext.globalState.get<string>(SELECTED_MODEL_STATE_KEY);
    if (saved && this.availableModels.some((m) => m.id === saved)) {
      this.selectedModelId = saved;
    } else if (this.availableModels.length > 0) {
      this.selectedModelId = this.availableModels[0].id;
    } else {
      this.selectedModelId = "";
    }
  }

  private cancelActiveGeneration(): void {
    if (!this.activeCancelSource && !this.isLoading) {
      return;
    }

    this.activeCancelSource?.cancel();

    if (this.activeGenerationKey) {
      this.generatingUris.delete(this.activeGenerationKey);
    }

    this.isLoading = false;
    this.cards = [];
    this.loadError = "Generation cancelled.";
    if (this.targetUri) {
      clearCachedImprovements(this.targetUri);
    } else if (this.activeGenerationKey) {
      clearCachedImprovements(vscode.Uri.parse(this.activeGenerationKey));
    }
    this.render();
  }

  /** Switch sidebar to another open diagram (or idle) without regenerating. */
  syncToActiveDiagram(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && canOpenMermaidPreview(activeEditor.document)) {
      this.loadDocumentState(activeEditor.document, false);
      this.render();
      return;
    }

    // Preview, diff, or webview has focus — keep the current diagram if its file is still open.
    if (this.targetUri) {
      const stickyDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === this.targetUri!.toString()
      );
      if (stickyDoc && canOpenMermaidPreview(stickyDoc)) {
        this.loadDocumentState(stickyDoc, false);
        this.render();
        return;
      }
    }

    const doc = getActiveOrOpenMermaidDocument();
    if (!doc) {
      this.hasDiagramFile = false;
      this.diagramFileName = "";
      this.targetUri = undefined;
      this.baseContent = "";
      this.cards = [];
      this.isLoading = false;
      this.loadError = "";
      this.providerLabel = "";
      this.render();
      return;
    }
    this.loadDocumentState(doc, false);
    this.render();
  }

  /**
   * CodeLens / command: focus sidebar, use cached cards for this file or generate new ones.
   */
  async openImproveDiagram(uri?: vscode.Uri): Promise<void> {
    const resolved = uri ?? getActiveOrOpenMermaidDocument()?.uri;
    if (!resolved) {
      vscode.window.showInformationMessage("Open a .mmd or .mermaid file first.");
      return;
    }

    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(resolved);
    } catch {
      vscode.window.showErrorMessage("Could not open the diagram file.");
      return;
    }

    if (!canOpenMermaidPreview(doc)) {
      vscode.window.showInformationMessage("Improve diagram works on Mermaid diagram files only.");
      return;
    }

    await this.refreshModels();
    this.loadDocumentState(doc, false);

    await vscode.commands.executeCommand(`${DiagramImprovementPanel.viewType}.focus`);

    await this.runGeneration(true);
  }

  private loadDocumentState(doc: vscode.TextDocument, keepLoading: boolean): void {
    this.hasDiagramFile = true;
    this.targetUri = doc.uri;
    this.baseContent = doc.getText();
    this.diagramFileName = path.basename(doc.uri.fsPath) || "Untitled diagram";

    if (!keepLoading) {
      this.isLoading = this.generatingUris.has(doc.uri.toString());
    }

    const cached = getCachedImprovements(doc.uri);
    if (this.isLoading) {
      this.cards = [];
      this.providerLabel = "";
      this.loadError = "";
    } else if (cached && cached.cards.length > 0) {
      this.applyCacheEntry(cached);
      this.loadError = "";
    } else {
      this.cards = [];
      this.providerLabel = "";
      this.loadError = "";
    }
  }

  private applyCacheEntry(entry: { cards: DiagramImprovementCard[]; providerLabel: string }): void {
    this.cards = entry.cards;
    this.providerLabel = entry.providerLabel;
  }

  private async runGeneration(force: boolean): Promise<void> {
    if (!this.targetUri) {
      this.syncToActiveDiagram();
    }
    if (!this.hasDiagramFile || !this.targetUri) {
      this.loadError = "Open a .mmd file, then use Improve this diagram or Generate.";
      this.render();
      return;
    }

    if (!this.baseContent.trim()) {
      this.cards = [];
      this.loadError = "Diagram is empty.";
      this.render();
      return;
    }

    if (this.availableModels.length === 0) {
      await this.refreshModels();
    }
    if (!this.selectedModelId || this.availableModels.length === 0) {
      this.loadError =
        "No AI model available. Install GitHub Copilot Chat or enable Cursor AI, then try Generate.";
      this.render();
      return;
    }

    const generationUri = this.targetUri;
    const generationKey = generationUri.toString();

    if (this.generatingUris.has(generationKey)) {
      this.isLoading = true;
      this.render();
      return;
    }

    if (!force) {
      const cached = getCachedImprovements(generationUri);
      if (cached && cached.cards.length > 0) {
        this.applyCacheEntry(cached);
        this.loadError = "";
        this.render();
        return;
      }
    }

    const content = this.baseContent;
    const modelId = this.selectedModelId;

    this.activeCancelSource?.dispose();
    this.activeCancelSource = new vscode.CancellationTokenSource();
    const cancellationToken = this.activeCancelSource.token;
    this.activeGenerationKey = generationKey;

    this.generatingUris.add(generationKey);
    this.isLoading = true;
    this.loadError = "";
    this.cards = [];
    this.render();

    try {
      const { cards, providerName } = await generateDiagramImprovements(content, {
        modelId,
        cancellationToken,
      });

      if (cancellationToken.isCancellationRequested) {
        return;
      }

      const providerLabel = providerName ?? "";
      if (cards.length > 0) {
        setCachedImprovements(generationUri, cards, providerLabel);
      }

      if (this.targetUri?.toString() !== generationKey) {
        return;
      }

      this.isLoading = false;
      this.cards = cards;
      this.providerLabel = providerLabel;
      this.loadError =
        cards.length > 0
          ? ""
          : "No AI model available. Install GitHub Copilot Chat or enable Cursor AI, then try Generate.";
      this.render();
    } catch (err) {
      if (cancellationToken.isCancellationRequested || isLanguageModelCancellation(err)) {
        return;
      }
      if (this.targetUri?.toString() !== generationKey) {
        return;
      }
      this.isLoading = false;
      this.cards = [];
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not generate diagram improvements. Please try again.";
      this.loadError = message;
      this.render();
      void vscode.window.showErrorMessage(message);
    } finally {
      this.generatingUris.delete(generationKey);
      if (this.activeGenerationKey === generationKey) {
        this.activeGenerationKey = undefined;
      }
      this.activeCancelSource?.dispose();
      this.activeCancelSource = undefined;
    }
  }

  private async openCardDiff(cardId: string): Promise<void> {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card || !this.targetUri) {
      return;
    }

    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === this.targetUri!.toString()
    );
    const base = doc?.getText() ?? this.baseContent;

    await this.diffProvider.showImprovementDiff(
      this.targetUri,
      base,
      card.proposedCode,
      card.title
    );
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.buildHtml();
  }

  private buildModelSelectHtml(): string {
    if (this.availableModels.length === 0) {
      return `<select class="model-select" id="modelSelect" disabled aria-label="Language model">
        <option>No model available</option>
      </select>`;
    }

    const options = this.availableModels
      .map(
        (m) =>
          `<option value="${escapeHtmlAttr(m.id)}"${
            m.id === this.selectedModelId ? " selected" : ""
          }>${escapeHtmlAttr(m.name)}</option>`
      )
      .join("");

    return `<select class="model-select" id="modelSelect" aria-label="Language model"${
      this.isLoading ? " disabled" : ""
    }>${options}</select>`;
  }

  private buildHtml(): string {
    const webview = this.view!.webview;
    const nonce = createWebviewNonce();
    const csp = webview.cspSource;
    const mermaidUrl = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist-sidebar", "mermaid.js")
    );

    if (!this.hasDiagramFile) {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; font-src ${csp}; script-src 'nonce-${nonce}' ${csp};">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 12px; padding: 8px 10px 12px; }
    .hint { font-size: 11px; opacity: 0.45; line-height: 1.45; padding: 12px 0; }
  </style>
</head>
<body>
  <p class="hint">Open a <code>.mmd</code> file, then use <strong>Improve this diagram</strong> above the diagram.</p>
</body>
</html>`;
    }

    const thumbCodesJson = JSON.stringify(this.cards.map((c) => c.proposedCode));
    const metaText = this.providerLabel
      ? `${this.diagramFileName} · via ${this.providerLabel}`
      : this.diagramFileName;
    const noModels = this.availableModels.length === 0;
    const modelSelectHtml = this.buildModelSelectHtml();

    const cardsHtml =
      this.cards.length === 0 && !this.isLoading
        ? `<p class="hint">${escapeHtmlAttr(
            this.loadError ||
              "Generate 2 optimized diagram variants: layout grouping and full styling."
          )}</p>
          <button type="button" class="primary-btn" id="btnGenerate"${
            noModels ? " disabled" : ""
          }>Generate improvements</button>`
        : this.cards
            .map(
              (card, index) => `
          <button type="button" class="improve-card" data-id="${escapeHtmlAttr(card.id)}" aria-label="${escapeHtmlAttr(card.title)}">
            <div class="card-head">
              <span class="card-title">${escapeHtmlAttr(card.title)}</span>
              <span class="card-action">Review diff →</span>
            </div>
            <div class="card-thumb" id="thumb-${index}">
              <span class="thumb-loading">Rendering…</span>
            </div>
          </button>`,
            )
            .join("");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; img-src ${csp} data:; font-src ${csp}; script-src 'nonce-${nonce}' ${csp};">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      font-size: 12px;
      padding: 8px 10px 12px;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }
    .meta { font-size: 11px; opacity: 0.45; line-height: 1.4; flex: 1; min-width: 0; word-break: break-word; }
    .model-row { margin-bottom: 10px; }
    .model-select {
      width: 100%;
      padding: 4px 8px;
      font: inherit;
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, rgba(128,128,128,0.35)));
      border-radius: 4px;
      outline: none;
    }
    .model-select:disabled { opacity: 0.55; }
    .model-select:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    .text-btn {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 0;
      flex-shrink: 0;
    }
    .text-btn:disabled { opacity: 0.4; cursor: default; }
    .primary-btn {
      width: 100%;
      margin-top: 8px;
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .primary-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .primary-btn:disabled { opacity: 0.45; cursor: default; }
    .loading-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 0;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.55;
      min-width: 0;
      flex: 1;
    }
    .loading span { font-size: 11px; }
    .spinner {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      border: 2px solid rgba(128,128,128,0.2);
      border-top-color: var(--vscode-progressBar-background, #3794ff);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .cards { display: flex; flex-direction: column; gap: 10px; }
    .improve-card {
      width: 100%;
      text-align: left;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      padding: 12px;
      cursor: pointer;
      color: inherit;
      font: inherit;
    }
    .improve-card:hover { border-color: var(--vscode-focusBorder, #007fd4); }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card-title {
      font-weight: 600;
      font-size: 12px;
      line-height: 1.35;
      flex: 1;
      min-width: 0;
    }
    .card-action { font-size: 10px; opacity: 0.45; white-space: nowrap; padding-top: 1px; }
    .card-thumb {
      min-height: 100px;
      max-height: 200px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.06));
      border-radius: 4px;
    }
    .card-thumb svg { max-width: 100%; max-height: 190px; height: auto; }
    .thumb-loading, .thumb-error { font-size: 10px; opacity: 0.35; font-style: italic; }
    .hint { font-size: 11px; opacity: 0.45; line-height: 1.45; padding: 4px 0; }
    .hint code { font-size: 10px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="meta">${escapeHtmlAttr(metaText)}</span>
    <button type="button" class="text-btn" id="btnRefresh" ${this.isLoading ? "disabled" : ""}>Refresh</button>
  </div>
  <div class="model-row">${modelSelectHtml}</div>
  ${
    this.isLoading
      ? `<div class="loading-row">
          <div class="loading"><div class="spinner"></div><span>Generating 2 improvements…</span></div>
          <button type="button" class="text-btn" id="btnCancel">Cancel</button>
        </div>`
      : `<div class="cards">${cardsHtml}</div>`
  }

  <script nonce="${nonce}" src="${mermaidUrl}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });
    document.getElementById('btnGenerate')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'generate' });
    });
    document.getElementById('btnCancel')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
    document.getElementById('modelSelect')?.addEventListener('change', (e) => {
      const modelId = e.target.value;
      if (modelId) vscode.postMessage({ type: 'setModel', modelId });
    });
    document.querySelectorAll('.improve-card').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (id) vscode.postMessage({ type: 'openCard', id });
      });
    });

    const thumbCodes = ${thumbCodesJson};
    async function renderThumbs() {
      if (typeof sidebarMermaid === 'undefined') return;
      thumbCodes.forEach(async (code, i) => {
        const container = document.getElementById('thumb-' + i);
        if (!container || !code) return;
        try {
          const svg = await sidebarMermaid.render(code, 'improve-' + i + '-' + Date.now());
          container.innerHTML = svg || '<span class="thumb-error">Could not render</span>';
        } catch {
          container.innerHTML = '<span class="thumb-error">Parse error</span>';
        }
      });
    }
    renderThumbs();
  </script>
</body>
</html>`;
  }
}

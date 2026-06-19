import * as vscode from "vscode";

/**
 * Slice 6 Config UX webview. A self-contained panel that renders the
 * {@link SyncConfigModel} as plain-language on/off rules and lets the user
 * add / edit / remove them without touching YAML. The panel keeps a working
 * copy of the model in JS and posts the whole thing back on Save.
 *
 * Protocol (webview ⇆ extension):
 *   → { command: "ready" }                  ask for the current model
 *   ← { command: "load",  model }           seed / reset the panel
 *   → { command: "save",  model }           persist
 *   ← { command: "saved" }                  success toast
 *   ← { command: "error", message }         inline validation / IO error
 *   → { command: "openRaw", file }          open .mermaidignore | smart yml
 */
export function generateSyncConfigContent(
  _webview: vscode.Webview,
  _extensionUri: vscode.Uri,
): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mermaid Sync Config</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 12px 12px 80px;
    margin: 0;
  }
  h1 { font-size: 14px; margin: 0 0 4px; }
  .intro { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0 0 16px; }
  .section { margin-bottom: 20px; }
  .section > h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25));
    padding-bottom: 4px;
  }
  .list { margin: 0 0 8px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 12px; padding: 2px 0; }
  .rule {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
  }
  .rule .pattern {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 3px 6px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  .badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 1px 7px;
    white-space: nowrap;
  }
  .badge.on  { background: rgba(45,164,78,.18); color: #3fb950; }
  .badge.off { background: rgba(248,81,73,.18); color: #f85149; }
  .icon-btn {
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1;
  }
  .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); color: var(--vscode-foreground); }
  .add-row { display: flex; gap: 6px; margin-top: 4px; }
  .add-row input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 4px 6px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  button.primary, button.add {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
  }
  button.primary:hover, button.add:hover { background: var(--vscode-button-hoverBackground); }
  .footer {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25));
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .footer button.primary { flex: 0 0 auto; }
  .status { font-size: 12px; flex: 1; }
  .status.error { color: #f85149; }
  .status.ok { color: #3fb950; }
  .status.dirty { color: var(--vscode-descriptionForeground); }
  .raw-links { font-size: 11px; margin-top: 8px; }
  .raw-links a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  .raw-links a:hover { text-decoration: underline; }
  .no-workspace { color: var(--vscode-descriptionForeground); font-size: 13px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
  <div id="noWorkspace" class="no-workspace" hidden>
    Open a folder to configure Mermaid Sync.
  </div>

  <div id="app" hidden>
    <h1>Mermaid Sync</h1>
    <p class="intro">Control what the Sync bot regenerates and what offers a diagram on commit.</p>

    <div class="section">
      <h2>Sync scope &mdash; what the bot regenerates</h2>
      <div data-list="syncInclude" data-effect="on"></div>
      <div data-list="syncExclude" data-effect="off"></div>
      <div data-list="ignore" data-effect="off" data-label=".mermaidignore"></div>
    </div>

    <div class="section">
      <h2>Trigger scope &mdash; create-on-commit nudge</h2>
      <div data-list="triggerInclude" data-effect="on"></div>
      <div data-list="triggerExclude" data-effect="off"></div>
    </div>

    <div class="raw-links">
      Prefer raw files?
      <a id="openIgnore">.mermaidignore</a> ·
      <a id="openSmart">.smart-mermaid-updates.yml</a>
    </div>
  </div>

  <div class="footer" id="footer" hidden>
    <button class="primary" id="saveBtn">Save</button>
    <span class="status" id="status"></span>
  </div>

<script>
  const vscode = acquireVsCodeApi();

  // Human-friendly headers for each editable list.
  const LIST_META = {
    syncInclude:    { title: "Always sync (on)",  add: "e.g. src/**" },
    syncExclude:    { title: "Never sync (off)",  add: "e.g. **/*.generated.*" },
    ignore:         { title: ".mermaidignore (off)", add: "e.g. node_modules/**" },
    triggerInclude: { title: "Offer a diagram (on)", add: "e.g. src/services/**" },
    triggerExclude: { title: "Don't offer (off)",  add: "e.g. **/*.test.*" },
  };
  const LISTS = Object.keys(LIST_META);

  let model = null;
  let dirty = false;

  function setStatus(text, kind) {
    const el = document.getElementById("status");
    el.textContent = text || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function markDirty() {
    dirty = true;
    setStatus("Unsaved changes", "dirty");
  }

  function render() {
    document.getElementById("noWorkspace").hidden = !!(model && model.hasWorkspace);
    document.getElementById("app").hidden = !(model && model.hasWorkspace);
    document.getElementById("footer").hidden = !(model && model.hasWorkspace);
    if (!model || !model.hasWorkspace) { return; }

    for (const key of LISTS) {
      const container = document.querySelector('[data-list="' + key + '"]');
      if (!container) { continue; }
      const effect = container.getAttribute("data-effect");
      const meta = LIST_META[key];

      container.innerHTML = "";

      const heading = document.createElement("div");
      heading.style.fontSize = "12px";
      heading.style.fontWeight = "600";
      heading.style.margin = "8px 0 4px";
      heading.textContent = meta.title;
      container.appendChild(heading);

      const items = model[key] || [];
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No rules";
        container.appendChild(empty);
      }

      items.forEach((pattern, index) => {
        const row = document.createElement("div");
        row.className = "rule";

        const input = document.createElement("input");
        input.className = "pattern";
        input.type = "text";
        input.value = pattern;
        input.addEventListener("change", () => {
          model[key][index] = input.value.trim();
          markDirty();
        });

        const badge = document.createElement("span");
        badge.className = "badge " + effect;
        badge.textContent = effect;

        const remove = document.createElement("button");
        remove.className = "icon-btn";
        remove.title = "Remove rule";
        remove.textContent = "✕";
        remove.addEventListener("click", () => {
          model[key].splice(index, 1);
          markDirty();
          render();
        });

        row.appendChild(input);
        row.appendChild(badge);
        row.appendChild(remove);
        container.appendChild(row);
      });

      const addRow = document.createElement("div");
      addRow.className = "add-row";
      const addInput = document.createElement("input");
      addInput.type = "text";
      addInput.placeholder = meta.add;
      const addBtn = document.createElement("button");
      addBtn.className = "add";
      addBtn.textContent = "Add";
      const doAdd = () => {
        const value = addInput.value.trim();
        if (!value) { return; }
        model[key].push(value);
        addInput.value = "";
        markDirty();
        render();
      };
      addBtn.addEventListener("click", doAdd);
      addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { doAdd(); } });
      addRow.appendChild(addInput);
      addRow.appendChild(addBtn);
      container.appendChild(addRow);
    }
  }

  document.getElementById("saveBtn").addEventListener("click", () => {
    if (!model) { return; }
    setStatus("Saving…", "dirty");
    vscode.postMessage({ command: "save", model });
  });
  document.getElementById("openIgnore").addEventListener("click", () => {
    vscode.postMessage({ command: "openRaw", file: "ignore" });
  });
  document.getElementById("openSmart").addEventListener("click", () => {
    vscode.postMessage({ command: "openRaw", file: "smart" });
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "load":
        model = msg.model;
        dirty = false;
        render();
        setStatus("", "");
        break;
      case "saved":
        dirty = false;
        setStatus("Saved", "ok");
        break;
      case "error":
        setStatus(msg.message || "Save failed", "error");
        break;
    }
  });

  vscode.postMessage({ command: "ready" });
</script>
</body>
</html>`;
}

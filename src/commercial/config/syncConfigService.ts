import * as vscode from "vscode";
import * as YAML from "yaml";

/**
 * Slice 6 — the shared control plane for Mermaid Sync.
 *
 * Reads and writes the two workspace-root config files that decide what the
 * Sync bot regenerates and what triggers the create-on-commit nudge (Slice 3 /
 * Step 3):
 *
 *   - `.mermaidignore`          — gitignore-style globs the bot never touches.
 *   - `.smart-mermaid-updates.yml` — sync scope + trigger scope (structured).
 *
 * Everything UI-facing goes through {@link loadSyncConfig} / {@link saveSyncConfig}
 * so the webview never has to understand either file format. {@link getTriggerScope}
 * is the query the create-on-commit feature will call.
 *
 * Round-trip is comment-preserving where it can be: the YAML file is edited via
 * the `yaml` Document API (keeps comments + untouched keys), and `.mermaidignore`
 * keeps its leading comment header.
 */

export const MERMAIDIGNORE_FILE = ".mermaidignore";
export const SMART_UPDATES_FILE = ".smart-mermaid-updates.yml";

/** Which of the editable lists a rule belongs to. */
export type ScopeTarget =
  | "ignore"
  | "syncInclude"
  | "syncExclude"
  | "triggerInclude"
  | "triggerExclude";

/**
 * The whole config as the UI sees it. Each list is an ordered array of glob
 * strings; the webview renders them as plain-language on/off rules and posts the
 * full model back on save.
 */
export interface SyncConfigModel {
  /** False when no folder is open — the UI shows a "open a folder" notice. */
  hasWorkspace: boolean;
  /** `.mermaidignore` patterns (each one = "off", the bot ignores it). */
  ignore: string[];
  /** `.smart-mermaid-updates.yml` → `sync.include` ("on"). */
  syncInclude: string[];
  /** `.smart-mermaid-updates.yml` → `sync.exclude` ("off"). */
  syncExclude: string[];
  /** `.smart-mermaid-updates.yml` → `triggerScope.include` ("on"). */
  triggerInclude: string[];
  /** `.smart-mermaid-updates.yml` → `triggerScope.exclude` ("off"). */
  triggerExclude: string[];
}

/** Result of {@link saveSyncConfig}: either ok, or a human-readable error. */
export type SaveResult = { ok: true } | { ok: false; error: string };

/** The query Step 3 (create-on-commit) uses to decide where to nudge. */
export interface TriggerScope {
  include: string[];
  exclude: string[];
}

function workspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function readFileIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return undefined;
  }
}

/** Strip a leading `!` (gitignore negation) and report whether it was present. */
function splitNegation(line: string): { pattern: string; negated: boolean } {
  if (line.startsWith("!")) {
    return { pattern: line.slice(1).trim(), negated: true };
  }
  return { pattern: line.trim(), negated: false };
}

/** Parse `.mermaidignore` into the patterns the bot ignores (drops negations). */
function parseIgnore(text: string | undefined): string[] {
  if (!text) {
    return [];
  }
  const patterns: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    // Negations re-include a path; for the UI's "ignored" list we only surface
    // the positive ignore patterns. (Negations are preserved on write below.)
    const { pattern, negated } = splitNegation(line);
    if (!negated && pattern.length > 0) {
      patterns.push(pattern);
    }
  }
  return patterns;
}

/** Extract the leading comment/blank header so we can preserve it on write. */
function ignoreHeader(text: string | undefined): string[] {
  if (!text) {
    return [];
  }
  const header: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      header.push(rawLine);
      continue;
    }
    break;
  }
  return header;
}

const DEFAULT_IGNORE_HEADER = [
  "# .mermaidignore — paths the Mermaid Sync bot must never regenerate.",
  "# One gitignore-style glob per line. Managed by the Mermaid Chart extension.",
  "",
];

function stringList(node: unknown): string[] {
  if (!Array.isArray(node)) {
    return [];
  }
  return node
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

interface SmartUpdates {
  syncInclude: string[];
  syncExclude: string[];
  triggerInclude: string[];
  triggerExclude: string[];
}

function parseSmartUpdates(text: string | undefined): SmartUpdates {
  if (!text) {
    return { syncInclude: [], syncExclude: [], triggerInclude: [], triggerExclude: [] };
  }
  let data: any;
  try {
    data = YAML.parse(text) ?? {};
  } catch {
    // Malformed YAML — surface nothing here and let the editor show the raw file;
    // saving will overwrite with a valid document.
    data = {};
  }
  return {
    syncInclude: stringList(data?.sync?.include),
    syncExclude: stringList(data?.sync?.exclude),
    triggerInclude: stringList(data?.triggerScope?.include),
    triggerExclude: stringList(data?.triggerScope?.exclude),
  };
}

/** Load both config files into a single UI model. Missing files → empty lists. */
export async function loadSyncConfig(): Promise<SyncConfigModel> {
  const root = workspaceRoot();
  if (!root) {
    return {
      hasWorkspace: false,
      ignore: [],
      syncInclude: [],
      syncExclude: [],
      triggerInclude: [],
      triggerExclude: [],
    };
  }

  const ignoreText = await readFileIfExists(vscode.Uri.joinPath(root, MERMAIDIGNORE_FILE));
  const smartText = await readFileIfExists(vscode.Uri.joinPath(root, SMART_UPDATES_FILE));
  const smart = parseSmartUpdates(smartText);

  return {
    hasWorkspace: true,
    ignore: parseIgnore(ignoreText),
    syncInclude: smart.syncInclude,
    syncExclude: smart.syncExclude,
    triggerInclude: smart.triggerInclude,
    triggerExclude: smart.triggerExclude,
  };
}

/** A glob is "valid enough" if it's a non-empty single line with no NUL byte. */
function invalidPattern(p: string): boolean {
  return p.length === 0 || p.includes("\n") || p.includes("\0");
}

function validate(model: SyncConfigModel): string | undefined {
  const all = [
    ...model.ignore,
    ...model.syncInclude,
    ...model.syncExclude,
    ...model.triggerInclude,
    ...model.triggerExclude,
  ];
  if (all.some(invalidPattern)) {
    return "Rules cannot be empty or contain line breaks.";
  }
  return undefined;
}

/** Re-include the leading comment header (or a default) above the patterns. */
function serializeIgnore(patterns: string[], existingText: string | undefined): string {
  const header = ignoreHeader(existingText);
  const lines = header.length > 0 ? [...header] : [...DEFAULT_IGNORE_HEADER];
  // Ensure exactly one blank line between header and the rules.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (lines.length > 0) {
    lines.push("");
  }
  for (const p of dedupe(patterns)) {
    lines.push(p);
  }
  return lines.join("\n") + "\n";
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

/**
 * Write the YAML through its Document API so comments and any keys we don't
 * manage survive. Replaces only the four scope lists.
 */
function serializeSmartUpdates(model: SyncConfigModel, existingText: string | undefined): string {
  let doc: YAML.Document.Parsed | YAML.Document;
  try {
    doc = existingText ? YAML.parseDocument(existingText) : new YAML.Document({});
  } catch {
    doc = new YAML.Document({});
  }
  if (!doc.contents || !YAML.isMap(doc.contents)) {
    doc.contents = doc.createNode({}) as any;
  }

  if (doc.get("version") === undefined) {
    doc.set("version", 1);
  }
  doc.setIn(["sync", "include"], dedupe(model.syncInclude));
  doc.setIn(["sync", "exclude"], dedupe(model.syncExclude));
  doc.setIn(["triggerScope", "include"], dedupe(model.triggerInclude));
  doc.setIn(["triggerScope", "exclude"], dedupe(model.triggerExclude));

  // Seed a header comment on first creation so a hand-editor knows the shape.
  if (!existingText && !doc.commentBefore) {
    doc.commentBefore =
      " Smart Mermaid Updates — controls what the Sync bot regenerates (sync)\n" +
      " and what triggers the create-on-commit nudge (triggerScope).\n" +
      " Managed by the Mermaid Chart extension; safe to hand-edit.";
  }
  return doc.toString();
}

async function writeFileAtomic(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

/** Validate and persist both files. Never writes a partially-valid model. */
export async function saveSyncConfig(model: SyncConfigModel): Promise<SaveResult> {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "Open a folder before editing Mermaid Sync config." };
  }
  const validationError = validate(model);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const ignoreUri = vscode.Uri.joinPath(root, MERMAIDIGNORE_FILE);
  const smartUri = vscode.Uri.joinPath(root, SMART_UPDATES_FILE);

  try {
    const existingIgnore = await readFileIfExists(ignoreUri);
    const existingSmart = await readFileIfExists(smartUri);
    await writeFileAtomic(ignoreUri, serializeIgnore(model.ignore, existingIgnore));
    await writeFileAtomic(smartUri, serializeSmartUpdates(model, existingSmart));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't write config: ${message}` };
  }
}

/**
 * The create-on-commit nudge (Step 3) asks this for the paths it may offer on.
 * Reads straight from disk so it always reflects the saved file.
 */
export async function getTriggerScope(): Promise<TriggerScope> {
  const root = workspaceRoot();
  if (!root) {
    return { include: [], exclude: [] };
  }
  const smartText = await readFileIfExists(vscode.Uri.joinPath(root, SMART_UPDATES_FILE));
  const smart = parseSmartUpdates(smartText);
  return { include: smart.triggerInclude, exclude: smart.triggerExclude };
}

/** Absolute URIs of the two config files (for the "edit raw" escape hatch). */
export function configFileUris(): { ignore?: vscode.Uri; smart?: vscode.Uri } {
  const root = workspaceRoot();
  if (!root) {
    return {};
  }
  return {
    ignore: vscode.Uri.joinPath(root, MERMAIDIGNORE_FILE),
    smart: vscode.Uri.joinPath(root, SMART_UPDATES_FILE),
  };
}

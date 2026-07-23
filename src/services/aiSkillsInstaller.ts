import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import {
  blockStart,
  blockEnd,
  getCopilotSkillContent,
  getCopilotPointer,
} from "./aiSkillsContent";

export interface InstallResult {
  filesWritten: Array<{ path: string; created: boolean }>;
}

export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeMermaidSkills(
  filePath: string,
  content: string,
  written: InstallResult["filesWritten"]
): void {
  const existed = fs.existsSync(filePath);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, "utf8");
  written.push({ path: filePath, created: !existed });
}

/** Adds or updates a Mermaid pointer block inside an always-on rules file. */
function appendRulesWithMermaidSkills(
  filePath: string,
  block: string,
  written: InstallResult["filesWritten"]
): void {
  const existed = fs.existsSync(filePath);
  const existing = existed ? fs.readFileSync(filePath, "utf8") : "";
  const startIdx = existing.indexOf(blockStart);
  const endIdx = existing.indexOf(blockEnd);

  let newContent: string;
  if (startIdx !== -1 && endIdx !== -1) {
    newContent =
      existing.slice(0, startIdx) +
      block +
      existing.slice(endIdx + blockEnd.length);
  } else {
    const sep =
      existing === "" || existing.endsWith("\n\n")
        ? ""
        : existing.endsWith("\n")
          ? "\n"
          : "\n\n";
    newContent = existing + sep + block + "\n";
  }

  ensureDir(filePath);
  fs.writeFileSync(filePath, newContent, "utf8");
  written.push({ path: filePath, created: !existed });
}

function getInstructionsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".github", "instructions", "mermaid.instructions.md");
}

/** True when Copilot Mermaid instructions already exist on disk. */
export function isInstalled(workspaceRoot: string): boolean {
  return fs.existsSync(getInstructionsPath(workspaceRoot));
}

/**
 * Installs Mermaid AI Skills for GitHub Copilot only
 * (.github/instructions + pointer in copilot-instructions.md).
 */
export function installSkillPack(workspaceRoot: string): InstallResult {
  const written: InstallResult["filesWritten"] = [];

  writeMermaidSkills(getInstructionsPath(workspaceRoot), getCopilotSkillContent(), written);
  appendRulesWithMermaidSkills(
    path.join(workspaceRoot, ".github", "copilot-instructions.md"),
    getCopilotPointer(),
    written
  );

  return { filesWritten: written };
}

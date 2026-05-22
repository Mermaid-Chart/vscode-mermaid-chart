import * as vscode from "vscode";
import { showDiagramPicker } from "../panels/diagramPickerPanel";

export interface DiagramSuggestion {
  type: string;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const DIAGRAM_TYPES = [
  { type: "flowchart", label: "Flowchart", description: "Control flow, process steps" },
  { type: "sequenceDiagram", label: "Sequence Diagram", description: "Function calls, message passing" },
  { type: "classDiagram", label: "Class Diagram", description: "Classes, interfaces, inheritance" },
  { type: "erDiagram", label: "ER Diagram", description: "Database tables, schemas" },
  { type: "stateDiagram-v2", label: "State Diagram", description: "State machines, transitions" },
  { type: "gantt", label: "Gantt Chart", description: "Project tasks, timelines" },
  { type: "mindmap", label: "Mindmap", description: "Concept hierarchies" },
  { type: "architecture-beta", label: "Architecture Diagram", description: "System architecture, services" },
  { type: "pie", label: "Pie Chart", description: "Proportional data" },
  { type: "gitGraph", label: "Git Graph", description: "Branch/merge workflows" },
] as const;

export function detectBestDiagramType(document: vscode.TextDocument): DiagramSuggestion {
  return detectBestDiagramTypeFromSource(
    document.getText(),
    document.languageId,
    document.fileName
  );
}

/** Same heuristics as {@link detectBestDiagramType} but for arbitrary text (e.g. a selection). */
export function detectBestDiagramTypeFromSource(
  text: string,
  langId: string,
  fileName: string
): DiagramSuggestion {
  const lowerFile = fileName.toLowerCase();

  if (isSchemaFile(lowerFile, langId, text)) {
    return { type: "erDiagram", label: "ER Diagram", confidence: "high", reason: "Database schema detected" };
  }

  if (isDockerOrInfra(lowerFile, text)) {
    return { type: "architecture-beta", label: "Architecture Diagram", confidence: "high", reason: "Infrastructure/Docker configuration detected" };
  }

  const classCount = countPatterns(text, langId, "class");
  const interfaceCount = countPatterns(text, langId, "interface");
  const functionCount = countPatterns(text, langId, "function");
  const statePatterns = countStatePatterns(text);
  const importCount = (text.match(/^import\s/gm) || []).length + (text.match(/^(?:const|let|var)\s+\w+\s*=\s*require\s*\(/gm) || []).length;

  if (classCount + interfaceCount >= 2) {
    return { type: "classDiagram", label: "Class Diagram", confidence: "high", reason: `Found ${classCount} classes and ${interfaceCount} interfaces` };
  }

  if (statePatterns >= 3) {
    return { type: "stateDiagram-v2", label: "State Diagram", confidence: "medium", reason: "State management patterns detected" };
  }

  if (functionCount >= 3 && importCount >= 2) {
    return { type: "sequenceDiagram", label: "Sequence Diagram", confidence: "medium", reason: `Found ${functionCount} functions with cross-module calls` };
  }

  if (functionCount >= 2) {
    return { type: "flowchart", label: "Flowchart", confidence: "medium", reason: `Found ${functionCount} functions with control flow` };
  }

  return { type: "flowchart", label: "Flowchart", confidence: "low", reason: "General code structure" };
}

const MERMAID_START =
  /^\s*(flowchart|graph\b|sequenceDiagram|classDiagram|erDiagram|stateDiagram-v2|stateDiagram|gantt|pie|mindmap|gitGraph|architecture)/im;

/** True if trimmed text starts with a Mermaid diagram keyword (e.g. pasted from a template literal). */
export function looksLikeMermaidDiagram(text: string): boolean {
  return MERMAID_START.test(text.trim());
}

/** Remove common extra indent from a multi-line selection (e.g. inside a TS template literal). */
export function dedentCommonIndent(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nonempty = lines.filter((l) => l.trim().length > 0);
  if (nonempty.length === 0) return text.trim();
  const minIndent = Math.min(
    ...nonempty.map((l) => {
      const m = l.match(/^(\s*)/);
      return m ? m[1].length : 0;
    })
  );
  return lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l)).join("\n").trim();
}

export async function pickDiagramType(
  suggestion: DiagramSuggestion,
  extensionUri: vscode.Uri
): Promise<string | undefined> {
  return showDiagramPicker(extensionUri, suggestion);
}

function isSchemaFile(fileName: string, langId: string, text: string): boolean {
  if (fileName.endsWith(".sql") || fileName.endsWith(".prisma") || fileName.endsWith(".schema")) {
    return true;
  }
  if (langId === "sql") return true;
  const schemaKeywords = /\b(CREATE\s+TABLE|model\s+\w+\s*\{|@Entity|@Table|Schema\s*\()/i;
  return schemaKeywords.test(text);
}

function isDockerOrInfra(fileName: string, text: string): boolean {
  if (/dockerfile|docker-compose|\.ya?ml$/i.test(fileName)) {
    return /\b(FROM|services:|image:|container_name:)/i.test(text);
  }
  if (/terraform|\.tf$/i.test(fileName)) return true;
  if (/kubernetes|k8s/i.test(fileName)) return true;
  if (/\bFROM\s+\S+/.test(text) && /\b(COPY|RUN|CMD|EXPOSE|WORKDIR|ENTRYPOINT)\b/.test(text)) return true;
  return false;
}

function countPatterns(text: string, langId: string, kind: "class" | "interface" | "function"): number {
  const patterns: Record<string, RegExp[]> = {
    class: [
      /\bclass\s+\w+/g,
      /\bstruct\s+\w+/g,
    ],
    interface: [
      /\binterface\s+\w+/g,
      /\bprotocol\s+\w+/g,
      /\btrait\s+\w+/g,
      /\btype\s+\w+\s*=\s*\{/g,
    ],
    function: [
      /\bfunction\s+\w+/g,
      /\bdef\s+\w+/g,
      /\bfunc\s+\w+/g,
      /\bfn\s+\w+/g,
      /\b(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/g,
      /\b(public|private|protected)\s+(static\s+)?(async\s+)?\w+\s*\(/g,
    ],
  };
  let count = 0;
  for (const pattern of patterns[kind] ?? []) {
    count += (text.match(pattern) || []).length;
  }
  return count;
}

function countStatePatterns(text: string): number {
  const stateKeywords = [
    /\bstate\b/gi,
    /\bsetState\b/g,
    /\buseReducer\b/g,
    /\btransition\b/gi,
    /\bSTATE_/g,
    /\benum\s+\w*[Ss]tate/g,
  ];
  let count = 0;
  for (const pattern of stateKeywords) {
    count += (text.match(pattern) || []).length;
  }
  return count;
}

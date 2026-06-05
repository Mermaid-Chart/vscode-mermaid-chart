/**
 * AST-Enhanced Diagram highlighting utility for VS Code Mermaid extension
 * 
 * This module provides functionality to compare two Mermaid diagrams using AST
 * element mappings for precise highlighting.
 * 
 * Uses appropriate parsers (Jison for flowchart, ANTLR for sequence) to get 
 * element mappings and exact SVG selectors for accurate highlighting.
 */

import mermaid, { type MermaidConfig } from '@mermaid-chart/mermaid';
import { splitFrontMatter } from '../../frontmatter';

export type DiagramChangeKind = 'added' | 'modified' | 'removed';

export interface DiagramChangeItem {
  kind: DiagramChangeKind;
  nodeId: string;
  label: string;
}

export interface DiagramDiffCounts {
  added: number;
  modified: number;
  removed: number;
  total: number;
}

export interface ReviewSurfaceDiff {
  counts: DiagramDiffCounts;
  changes: DiagramChangeItem[];
  addedNodeIds: string[];
  modifiedNodeIds: string[];
  removedNodeIds: string[];
  newHighlightInstructions: HighlightInstruction[];
  oldHighlightInstructions: HighlightInstruction[];
  astAvailable: boolean;
}

// AST and element mapping interfaces (from collab approach)
export interface ElementPosition {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startIndex?: number;
  endIndex?: number;
}

export interface ElementMapping {
  id: string;
  type: string;
  position: ElementPosition;
  svgId?: string;
  data: any;
}

export interface DiagramAST {
  elementMappings?: ElementMapping[];
  getElementsOnLine?(line: number): ElementMapping[];
  getElementById?(id: string): ElementMapping | undefined;
  getElementByDataId?(dataId: string): ElementMapping | undefined;
}

export interface DiagramDiff {
  addedNodes: string[];
  modifiedNodes: string[];
  removedNodes: string[];  // Added support for removed nodes
  addedEdges: string[];
  modifiedEdges: string[];
  removedEdges: string[];  // Added support for removed edges
  addedText: string[];
  diagramType?: string; // Added diagram type for type-specific handling
}

export interface HighlightInstruction {
  type: 'node' | 'edge' | 'text';
  elementId?: string;
  selector?: string;
  /** For edges (ANTLR): matches SVG `data-id` on `[data-et="edge"]` (see elementMappings[].data.svgId). Optional extra hint for nodes. */
  svgId?: string;
  /**
   * Direct DOM CSS selector from ANTLR parser (e.g. '[data-et="message"][data-id="i0"]').
   * More reliable than svgId for sequence diagrams - use this first in the frontend.
   */
  svgSelector?: string;
  changeType: 'added' | 'modified' | 'removed';
}

/**
 * Collab resolves edge elements via mapping.data.svgId → SVG data-id, not mapping.svgId / DOM id.
 */
function edgeDomDataIdFromMapping(mapping: ElementMapping | undefined): string | undefined {
  if (!mapping) {
    return undefined;
  }
  const d = mapping.data;
  if (d && typeof d === 'object' && 'svgId' in d && (d as { svgId?: unknown }).svgId != null) {
    return String((d as { svgId: unknown }).svgId);
  }
  return mapping.svgId;
}

/**
 * Initialize Mermaid with Jison parser for better text extraction
 */
function initializeMermaidWithAST(): void {
  // VS Code extension host is Node: `dompurify` has no browser Document, so `addHook` is missing
  // and FlowDB.sanitizeText throws. parseOnly skips DOMPurify while still parsing (we only need AST).
  const config: MermaidConfig = {
    startOnLoad: false,
    securityLevel: "parseOnly",
    flowchart: { parser: "jison" } as MermaidConfig["flowchart"], // Jison for better text extraction
    sequence: { parser: "antlr" } as MermaidConfig["sequence"], // ANTLR for sequences
    maxTextSize: 90000,
  };
  mermaid.initialize(config as MermaidConfig);
}

/**
 * Parse Mermaid code and extract AST with element mappings
 */
async function parseWithAST(code: string, diagramType: string): Promise<DiagramAST | undefined> {
  try {
    initializeMermaidWithAST();
    const res = await mermaid.parse(code);
    
    if (!res?.diagram?.db) {
      return undefined;
    }
    
    // Extract AST using collab's approach
    const db = res.diagram.db as { getAST?: () => DiagramAST };
    if (typeof db.getAST === 'function') {
      return db.getAST();
    }
    
    return undefined;
  } catch (error) {
    console.warn('[AST-Diff] Failed to parse with AST, falling back to text-based:', error);
    return undefined;
  }
}

export type DiagramHighlightCapabilityMode = "ast" | "none";

export interface DiagramHighlightCapability {
  mode: DiagramHighlightCapabilityMode;
  diagramType: "flowchart" | "sequence" | "unknown";
}

/**
 * Whether AST element mappings exist for this diagram (flowchart / sequence only).
 * Used as a host-side hint; the webview still verifies IDs against rendered SVG nodes.
 */
export async function resolveDiagramHighlightCapability(
  code: string,
): Promise<DiagramHighlightCapability> {
  const diagramType = detectDiagramType(code);
  if (diagramType === "unknown") {
    return { mode: "none", diagramType };
  }
  const ast = await parseWithAST(code, diagramType);
  const hasMappings = (ast?.elementMappings?.length ?? 0) > 0;
  return { mode: hasMappings ? "ast" : "none", diagramType };
}

/**
 * Detect diagram type from code
 */
export function detectDiagramType(code: string): "flowchart" | "sequence" | "unknown" {
  const trimmed = code.trim();
  if (trimmed.includes('sequenceDiagram')) {
    return 'sequence';
  }
  if (trimmed.includes('flowchart') || trimmed.includes('graph')) {
    return 'flowchart';
  }
  return 'unknown';
}

/**
 * Deduplicate sequence diagram element mappings
 * ANTLR parser creates duplicates: statement-level + visual-level mappings
 */
function deduplicateSequenceElementMappings(mappings: ElementMapping[]): ElementMapping[] {
  if (!mappings || mappings.length === 0) return mappings;
  
  const seen = new Set<string>();
  const deduplicated = mappings.filter(mapping => {
    const visualKey = mapping.svgId || mapping.id;
    if (seen.has(visualKey)) {
      return false;
    }
    seen.add(visualKey);
    return true;
  });
  
  return deduplicated;
}

/**
 * Calculate differences between two diagrams using AST-based comparison
 */
export async function calculateDiagramDiff(oldCode: string, newCode: string): Promise<DiagramDiff & { oldAST?: DiagramAST; newAST?: DiagramAST; diagramType?: string }> {
  const diagramType = detectDiagramType(newCode);

  // Only support flowchart and sequence diagrams with AST
  if (diagramType !== 'flowchart' && diagramType !== 'sequence') {
    throw new Error(`Unsupported diagram type for diff highlighting: ${diagramType}. Only flowchart and sequence diagrams are supported.`);
  }

  try {
    // Parse both diagrams with AST to get element mappings
    const [oldAST, newAST] = await Promise.all([
      parseWithAST(oldCode, diagramType),
      parseWithAST(newCode, diagramType)
    ]);

    if (!oldAST?.elementMappings || !newAST?.elementMappings) {
      throw new Error(`Failed to parse ${diagramType} diagrams - AST element mappings not available`);
    }
    
    // // For sequence diagrams, deduplicate mappings to avoid ANTLR parser issues
    if (diagramType === 'sequence') {
      oldAST.elementMappings = deduplicateSequenceElementMappings(oldAST.elementMappings);
      newAST.elementMappings = deduplicateSequenceElementMappings(newAST.elementMappings);
    }
    
    const result = calculateASTBasedDiff(oldAST, newAST, diagramType);
    return {
      ...result,
      oldAST,
      newAST,
      diagramType
    };
  } catch (error) {
    console.error(`[AST-Diff] AST parsing failed:`, error);
    throw new Error(`Failed to parse ${diagramType} diagram for diff highlighting: ${error}`);
  }
}

/**
 * Calculate diff using AST element mappings (collab methodology)
 */
function calculateASTBasedDiff(oldAST: DiagramAST, newAST: DiagramAST, diagramType: string): DiagramDiff {
  const diff: DiagramDiff = {
    addedNodes: [],
    modifiedNodes: [],
    removedNodes: [],
    addedEdges: [],
    modifiedEdges: [],
    removedEdges: [],
    addedText: []
  };
  
  const oldElements = oldAST.elementMappings || [];
  const newElements = newAST.elementMappings || [];
  
  // Helper to check if element is a node  
  function isNodeElement(element: ElementMapping): boolean {
    return element.type === 'vertex' || element.type === 'participant';
  }
  
  // Helper to check if element is an edge
  function isEdgeElement(element: ElementMapping): boolean {
    return element.type === 'edge' || element.type === 'message';
  }
  
  // Helper to get logical ID from element (stable ID for sequence diagrams)
  function getLogicalId(element: ElementMapping, diagramType: string): string {
    if (diagramType === 'sequence' && element.type === 'message' && element.data) {
      // For sequence messages, use stable position-based ID that excludes message text
      const { from, to } = element.data;
      // Use svgId (more stable) or fallback to participants + position for uniqueness
      const stableId = element.svgId || `msg_${from}_${to}`;
      return `${stableId}:${from}->${to}`;
    }
    // For other elements, use data.id or fallback to element.id
    const logicalId = element.data?.id || element.id;
    return logicalId;
  }

  // Helper to get best vertex representation (prioritize actual node definitions over edge-generated duplicates)
  function getBestVertex(elements: ElementMapping[], logicalId: string): ElementMapping | undefined {
    const candidates = elements.filter(el => isNodeElement(el) && getLogicalId(el, diagramType) === logicalId);
    if (candidates.length === 0) return undefined;
    
    // Priority: 1) Has type/shape info, 2) Has rich text content, 3) First occurrence
    return candidates.reduce((best, current) => {
      const bestData = best.data || {};
      const currentData = current.data || {};
      
      // Prefer vertices with type info (actual node definitions)
      if (currentData.type && !bestData.type) return current;
      if (bestData.type && !currentData.type) return best;
      
      // Prefer vertices with richer text content
      const bestTextLen = (bestData.text || '').length;
      const currentTextLen = (currentData.text || '').length;
      if (currentTextLen > bestTextLen) return current;
      
      return best;
    });
  }

  // Create maps for efficient lookup with deduplication
  const oldNodesMap = new Map<string, ElementMapping>();
  const oldEdgesMap = new Map<string, ElementMapping>();
  const newNodesMap = new Map<string, ElementMapping>();
  const newEdgesMap = new Map<string, ElementMapping>();
  
  // Get unique logical node IDs from old elements  
  const oldNodeIds = new Set(oldElements
    .filter(el => isNodeElement(el))
    .map(el => getLogicalId(el, diagramType))
  );
  
  // Populate old nodes map with best representations
  for (const logicalId of oldNodeIds) {
    const bestVertex = getBestVertex(oldElements, logicalId);
    if (bestVertex) {
      oldNodesMap.set(logicalId, bestVertex);
    }
  }
  
  // Populate old edges map
  oldElements.forEach(element => {
    if (isEdgeElement(element)) {
      const logicalId = getLogicalId(element, diagramType);
      oldEdgesMap.set(logicalId, element);
    }
  });
  
  // Get unique logical node IDs from new elements
  const newNodeIds = new Set(newElements
    .filter(el => isNodeElement(el))
    .map(el => getLogicalId(el, diagramType))
  );
  
  // Populate new nodes map and detect changes
  for (const logicalId of newNodeIds) {
    const bestVertex = getBestVertex(newElements, logicalId);
    if (bestVertex) {
      newNodesMap.set(logicalId, bestVertex);

      if (!oldNodesMap.has(logicalId)) {
        diff.addedNodes.push(bestVertex.id);
      } else {
        const oldNode = oldNodesMap.get(logicalId)!;
        if (isNodeModified(oldNode, bestVertex)) {
          diff.modifiedNodes.push(bestVertex.id);
        }
      }
    }
  }
  
  // Populate new edges map and detect changes
  newElements.forEach(element => {
    if (isEdgeElement(element)) {
      const logicalId = getLogicalId(element, diagramType);
      newEdgesMap.set(logicalId, element);

      if (!oldEdgesMap.has(logicalId)) {
        diff.addedEdges.push(element.id);
      } else {
        const oldEdge = oldEdgesMap.get(logicalId)!;
        if (isEdgeModified(oldEdge, element)) {
          diff.modifiedEdges.push(element.id);
        }
      }
    }
  });
  
  // Find removed elements
  for (const logicalId of oldNodeIds) {
    if (!newNodesMap.has(logicalId)) {
      const removedVertex = oldNodesMap.get(logicalId)!;
      diff.removedNodes.push(removedVertex.id);
    }
  }
  
  oldEdgesMap.forEach((element, logicalId) => {
    if (!newEdgesMap.has(logicalId)) {
      diff.removedEdges.push(element.id);
    }
  });
  
  return diff;
}

/**
 * Convert diagram diff into highlight instructions with AST element mapping support
 */
export async function createHighlightInstructions(
  diff: DiagramDiff & { oldAST?: DiagramAST; newAST?: DiagramAST; diagramType?: string }
): Promise<{
  newDiagramInstructions: HighlightInstruction[];
  oldDiagramInstructions: HighlightInstruction[];
}> {
  const newDiagramInstructions: HighlightInstruction[] = [];
  const oldDiagramInstructions: HighlightInstruction[] = [];

  // AST should already be available from calculateDiagramDiff
  const { oldAST, newAST, diagramType } = diff;
  
  if (!oldAST || !newAST || !diagramType) {
    throw new Error('AST data missing from diff calculation. Ensure calculateDiagramDiff was called first.');
  }
  
  // Helper to find element mapping by ID
  const findElementMapping = (ast: DiagramAST | undefined, elementId: string) => {
    const mapping = ast?.elementMappings?.find(mapping => mapping.id === elementId);
    return mapping;
  };

  /**
   * Extract the direct DOM selector from the ANTLR runtime object.
   */
  const extractSvgSelector = (mapping: ElementMapping | undefined): string | undefined => {
    if (!mapping) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtimeSelector = (mapping as any).svgSelector;
    return typeof runtimeSelector === 'string' ? runtimeSelector : undefined;
  };

  /**
   * For sequence participant nodes, find the name-based svgSelector from sibling mappings.
   */
  const findParticipantSvgSelector = (ast: DiagramAST | undefined, participantId: string): string | undefined => {
    if (!ast?.elementMappings) return undefined;
    // Look for a participant mapping with a name-based svgSelector
    for (const el of ast.elementMappings) {
      if (el.type === 'participant' && el.data?.id === participantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sel = (el as any).svgSelector as string | undefined;
        // Name-based selectors contain data-id="Alice", not a timestamp
        if (sel && !sel.match(/data-id="\w+_\d+_\d+"/)) {
          return sel;
        }
      }
    }
    return undefined;
  };

  // Helper to create highlight instruction for nodes
  const createNodeInstruction = (elementId: string, ast: DiagramAST, changeType: 'added' | 'modified' | 'removed'): HighlightInstruction => {
    const mapping = findElementMapping(ast, elementId);
    const logicalNodeId = mapping?.data?.id || elementId;
    const svgSelector = diagramType === 'sequence'
      ? findParticipantSvgSelector(ast, logicalNodeId)
      : extractSvgSelector(mapping);
    return {
      type: 'node',
      elementId: logicalNodeId,
      svgId: mapping?.svgId,
      svgSelector,
      changeType
    };
  };

  // Helper to create highlight instruction for edges
  const createEdgeInstruction = (elementId: string, ast: DiagramAST, changeType: 'added' | 'modified' | 'removed'): HighlightInstruction => {
    const mapping = findElementMapping(ast, elementId);
    const svgId = diagramType === 'sequence'
      ? edgeDomDataIdFromMapping(mapping)
      : mapping?.svgId;
    const svgSelector = extractSvgSelector(mapping);
    return {
      type: 'edge',
      elementId,
      svgId,
      svgSelector,
      changeType
    };
  };

  // Process all node changes
  diff.addedNodes.forEach(nodeId => newDiagramInstructions.push(createNodeInstruction(nodeId, newAST, 'added')));
  diff.modifiedNodes.forEach(nodeId => newDiagramInstructions.push(createNodeInstruction(nodeId, newAST, 'modified')));
  diff.removedNodes.forEach(nodeId => oldDiagramInstructions.push(createNodeInstruction(nodeId, oldAST, 'removed')));

  // Process all edge changes
  diff.addedEdges.forEach(edgeId => newDiagramInstructions.push(createEdgeInstruction(edgeId, newAST, 'added')));
  diff.modifiedEdges.forEach(edgeId => newDiagramInstructions.push(createEdgeInstruction(edgeId, newAST, 'modified')));
  diff.removedEdges.forEach(edgeId => oldDiagramInstructions.push(createEdgeInstruction(edgeId, oldAST, 'removed')));

  return { newDiagramInstructions, oldDiagramInstructions };
}

function findAstMapping(ast: DiagramAST | undefined, elementId: string): ElementMapping | undefined {
  return ast?.elementMappings?.find((mapping) => mapping.id === elementId);
}

function elementDisplayLabel(mapping: ElementMapping | undefined, fallbackId: string): string {
  const data = mapping?.data;
  if (!data || typeof data !== 'object') {
    return fallbackId;
  }
  const text = data.text ?? data.label ?? data.message ?? data.labelText;
  if (text != null && String(text).trim()) {
    return String(text).trim();
  }
  if (data.from != null && data.to != null) {
    return `${data.from} → ${data.to}`;
  }
  if (data.id != null) {
    return String(data.id);
  }
  return fallbackId;
}

function focusNodeIdFromMapping(mapping: ElementMapping | undefined, parserId: string): string {
  if (mapping?.data?.id != null) {
    return String(mapping.data.id);
  }
  return parserId;
}

export function buildReviewChangeList(
  diff: DiagramDiff,
  oldAST?: DiagramAST,
  newAST?: DiagramAST,
): DiagramChangeItem[] {
  const items: DiagramChangeItem[] = [];

  for (const parserId of diff.addedNodes) {
    const mapping = findAstMapping(newAST, parserId);
    const nodeId = focusNodeIdFromMapping(mapping, parserId);
    items.push({ kind: 'added', nodeId, label: elementDisplayLabel(mapping, nodeId) });
  }
  for (const parserId of diff.modifiedNodes) {
    const oldMapping = findAstMapping(oldAST, parserId);
    const newMapping = findAstMapping(newAST, parserId);
    const nodeId = focusNodeIdFromMapping(newMapping ?? oldMapping, parserId);
    const oldLabel = elementDisplayLabel(oldMapping, nodeId);
    const newLabel = elementDisplayLabel(newMapping, nodeId);
    items.push({
      kind: 'modified',
      nodeId,
      label: oldLabel !== newLabel ? `${oldLabel} → ${newLabel}` : newLabel,
    });
  }
  for (const parserId of diff.removedNodes) {
    const mapping = findAstMapping(oldAST, parserId);
    const nodeId = focusNodeIdFromMapping(mapping, parserId);
    items.push({ kind: 'removed', nodeId, label: elementDisplayLabel(mapping, nodeId) });
  }
  for (const parserId of diff.addedEdges) {
    const mapping = findAstMapping(newAST, parserId);
    const nodeId = focusNodeIdFromMapping(mapping, parserId);
    items.push({ kind: 'added', nodeId, label: elementDisplayLabel(mapping, nodeId) });
  }
  for (const parserId of diff.modifiedEdges) {
    const oldMapping = findAstMapping(oldAST, parserId);
    const newMapping = findAstMapping(newAST, parserId);
    const nodeId = focusNodeIdFromMapping(newMapping ?? oldMapping, parserId);
    const oldLabel = elementDisplayLabel(oldMapping, nodeId);
    const newLabel = elementDisplayLabel(newMapping, nodeId);
    items.push({
      kind: 'modified',
      nodeId,
      label: oldLabel !== newLabel ? `${oldLabel} → ${newLabel}` : newLabel,
    });
  }
  for (const parserId of diff.removedEdges) {
    const mapping = findAstMapping(oldAST, parserId);
    const nodeId = focusNodeIdFromMapping(mapping, parserId);
    items.push({ kind: 'removed', nodeId, label: elementDisplayLabel(mapping, nodeId) });
  }

  return items;
}

export function summarizeAstDiff(diff: DiagramDiff): DiagramDiffCounts {
  const added = diff.addedNodes.length + diff.addedEdges.length;
  const modified = diff.modifiedNodes.length + diff.modifiedEdges.length;
  const removed = diff.removedNodes.length + diff.removedEdges.length;
  return { added, modified, removed, total: added + modified + removed };
}

function filterIdsFromInstructions(
  instructions: HighlightInstruction[],
  changeType: DiagramChangeKind,
): string[] {
  return instructions
    .filter((instruction) => instruction.changeType === changeType)
    .map((instruction) => instruction.elementId ?? '')
    .filter((id) => id.length > 0);
}

const EMPTY_REVIEW_SURFACE: ReviewSurfaceDiff = {
  counts: { added: 0, modified: 0, removed: 0, total: 0 },
  changes: [],
  addedNodeIds: [],
  modifiedNodeIds: [],
  removedNodeIds: [],
  newHighlightInstructions: [],
  oldHighlightInstructions: [],
  astAvailable: false,
};

/**
 * AST-based diff for the app-review surface: counts, change list, and highlight instructions.
 * Returns an empty result when the diagram type is unsupported or parsing fails.
 */
export async function computeReviewSurfaceDiff(
  oldContent: string,
  newContent: string,
): Promise<ReviewSurfaceDiff> {
  const { diagramText: oldDiagramText } = splitFrontMatter(oldContent);
  const { diagramText: newDiagramText } = splitFrontMatter(newContent);

  try {
    const diagramDiff = await calculateDiagramDiff(oldDiagramText, newDiagramText);
    const { newDiagramInstructions, oldDiagramInstructions } =
      await createHighlightInstructions(diagramDiff);

    return {
      counts: summarizeAstDiff(diagramDiff),
      changes: buildReviewChangeList(diagramDiff, diagramDiff.oldAST, diagramDiff.newAST),
      addedNodeIds: filterIdsFromInstructions(newDiagramInstructions, 'added'),
      modifiedNodeIds: filterIdsFromInstructions(newDiagramInstructions, 'modified'),
      removedNodeIds: filterIdsFromInstructions(oldDiagramInstructions, 'removed'),
      newHighlightInstructions: newDiagramInstructions,
      oldHighlightInstructions: oldDiagramInstructions,
      astAvailable: true,
    };
  } catch {
    return EMPTY_REVIEW_SURFACE;
  }
}

/**
 * Enhanced comparison to detect if a node has been modified
 * Checks multiple fields where text content might be stored
 */
function isNodeModified(oldNode: ElementMapping, newNode: ElementMapping): boolean {
  const oldData = oldNode.data || {};
  const newData = newNode.data || {};
  
  // Check text fields (most important for visual changes)
  const textFields = ['text', 'label', 'labelText', 'value', 'title'];
  for (const field of textFields) {
    if (oldData[field] !== newData[field]) {
      return true;
    }
  }
  
  // Check shape/type changes  
  const shapeFields = ['shape', 'type', 'nodeType'];
  for (const field of shapeFields) {
    if (oldData[field] !== newData[field]) {
      return true;
    }
  }
  
  // Skip full JSON comparison as it's too sensitive to irrelevant changes
  return false;
}

/**
 * Enhanced comparison to detect if an edge has been modified
 * Focuses on meaningful content changes, ignoring metadata
 */
function isEdgeModified(oldEdge: ElementMapping, newEdge: ElementMapping): boolean {
  const oldData = oldEdge.data || {};
  const newData = newEdge.data || {};
  
  // For sequence messages, focus on message content changes
  if (oldEdge.type === 'message') {
    const messageFields = ['message', 'text', 'label'];
    for (const field of messageFields) {
      if (oldData[field] !== newData[field]) {
        return true;
      }
    }
    
    // Check if participants changed (structural change)
    if (oldData.from !== newData.from || oldData.to !== newData.to) {
      return true;
    }
    
    return false;
  }
  
  // For other edge types, check standard fields
  const edgeFields = ['text', 'label', 'labelText', 'start', 'end', 'stroke', 'type'];
  for (const field of edgeFields) {
    if (oldData[field] !== newData[field]) {
      return true;
    }
  }
  
  return false;
}
import * as vscode from "vscode";
import type { DiagramImprovementCard } from "./diagramImprovementService";

export interface DiagramImprovementCacheEntry {
  cards: DiagramImprovementCard[];
  providerLabel: string;
}

/** In-memory per diagram file; cleared when the extension deactivates (VS Code close / reload). */
const cacheByUri = new Map<string, DiagramImprovementCacheEntry>();

function cacheKey(uri: vscode.Uri): string {
  return uri.toString();
}

export function getCachedImprovements(uri: vscode.Uri): DiagramImprovementCacheEntry | undefined {
  return cacheByUri.get(cacheKey(uri));
}

export function setCachedImprovements(
  uri: vscode.Uri,
  cards: DiagramImprovementCard[],
  providerLabel: string
): void {
  cacheByUri.set(cacheKey(uri), { cards, providerLabel });
}

export function clearCachedImprovements(uri: vscode.Uri): void {
  cacheByUri.delete(cacheKey(uri));
}

export function clearDiagramImprovementCache(): void {
  cacheByUri.clear();
}

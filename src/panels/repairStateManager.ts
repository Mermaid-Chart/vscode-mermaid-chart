import * as vscode from "vscode";

interface ChangeChunk {
  range: vscode.Range;
  originalText: string;
  newText: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface RepairState {
  originalCode: string;
  repairedCode: string;
  originalUri: vscode.Uri;
  changes: ChangeChunk[];
}

/**
 * Global state manager for AI repairs - works without preview panel
 */
export class RepairStateManager {
  private static instance: RepairStateManager;
  private repairStates: Map<string, RepairState> = new Map();

  private constructor() {}

  public static getInstance(): RepairStateManager {
    if (!RepairStateManager.instance) {
      RepairStateManager.instance = new RepairStateManager();
    }
    return RepairStateManager.instance;
  }

  public setRepairState(uri: vscode.Uri, state: RepairState) {
    this.repairStates.set(uri.toString(), state);
  }

  public getRepairState(uri: vscode.Uri): RepairState | undefined {
    return this.repairStates.get(uri.toString());
  }

  public clearRepairState(uri: vscode.Uri) {
    this.repairStates.delete(uri.toString());
  }

  public hasRepairState(uri: vscode.Uri): boolean {
    return this.repairStates.has(uri.toString());
  }
}

export type { ChangeChunk, RepairState };

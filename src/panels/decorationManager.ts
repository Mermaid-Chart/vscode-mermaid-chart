import * as vscode from "vscode";

/**
 * Singleton to manage shared decoration types across preview and commands
 */
class DecorationManager {
  private static instance: DecorationManager;
  
  public readonly addedDecorationType: vscode.TextEditorDecorationType;
  public readonly removedDecorationType: vscode.TextEditorDecorationType;

  private constructor() {
    this.addedDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0, 255, 0, 0.15)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(0, 255, 0, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.removedDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 0, 0, 0.15)',
      isWholeLine: true,
      textDecoration: 'line-through',
      overviewRulerColor: 'rgba(255, 0, 0, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });
  }

  public static getInstance(): DecorationManager {
    if (!DecorationManager.instance) {
      DecorationManager.instance = new DecorationManager();
    }
    return DecorationManager.instance;
  }

  public dispose() {
    this.addedDecorationType.dispose();
    this.removedDecorationType.dispose();
  }
}

export default DecorationManager;

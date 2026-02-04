import * as vscode from "vscode";
import { RepairStateManager, ChangeChunk } from "./repairStateManager";
import { RepairCodeLensProvider } from "./repairCodeLensProvider";
import DecorationManager from "./decorationManager";

function applyDecorations(editor: vscode.TextEditor, changes: ChangeChunk[]) {
  const decorationManager = DecorationManager.getInstance();
  const pendingRanges: vscode.Range[] = [];

  // Only show decorations for pending changes
  for (const change of changes) {
    if (change.status === 'pending') {
      pendingRanges.push(change.range);
    }
  }

  // CRITICAL: Use the SAME decoration type that was used to create them
  // Clear by setting to empty array, or set to pending ranges
  editor.setDecorations(decorationManager.addedDecorationType, pendingRanges);
  editor.setDecorations(decorationManager.removedDecorationType, []); // Always clear removed
  
  console.log(`[applyDecorations] Set decorations to ${pendingRanges.length} pending changes, cleared ${changes.length - pendingRanges.length} accepted/rejected`);
}

export async function acceptSingleChange(uri: vscode.Uri, lineNumber: number, codeLensProvider: RepairCodeLensProvider) {
  console.log(`[acceptSingleChange] Line ${lineNumber}, uri=${uri.toString()}`);
  
  const repairState = RepairStateManager.getInstance().getRepairState(uri);
  if (!repairState) {
    console.log("[acceptSingleChange] No repair state found");
    vscode.window.showWarningMessage("No pending AI repair found for this file.");
    return;
  }

  console.log(`[acceptSingleChange] Found ${repairState.changes.length} changes`);

  const change = repairState.changes.find(
    c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber
  );

  if (!change) {
    console.log(`[acceptSingleChange] No change found for line ${lineNumber}`);
    return;
  }

  if (change.status !== 'pending') {
    console.log(`[acceptSingleChange] Change already processed: ${change.status}`);
    return;
  }

  console.log(`[acceptSingleChange] Accepting change at lines ${change.range.start.line}-${change.range.end.line}`);

  // Mark as accepted
  change.status = 'accepted';

  // Find and update the editor
  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === uri.toString()
  );

  if (!editor) {
    // If editor not visible, try opening the document
    const doc = await vscode.workspace.openTextDocument(uri);
    const newEditor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
    applyDecorations(newEditor, repairState.changes);
  } else {
    // Update decorations to remove this change's highlight
    applyDecorations(editor, repairState.changes);
  }

  // Update CodeLens to refresh buttons
  codeLensProvider.updateChangeStatus(uri, lineNumber, 'accepted');

  console.log(`✓ Change accepted, ${repairState.changes.filter(c => c.status === 'pending').length} remaining`);

  // Check if all changes are processed
  checkIfAllProcessed(uri, repairState, codeLensProvider);
}

export async function rejectSingleChange(uri: vscode.Uri, lineNumber: number, codeLensProvider: RepairCodeLensProvider) {
  console.log(`[rejectSingleChange] Line ${lineNumber}, uri=${uri.toString()}`);
  
  const repairState = RepairStateManager.getInstance().getRepairState(uri);
  if (!repairState) {
    console.log("[rejectSingleChange] No repair state found");
    vscode.window.showWarningMessage("No pending AI repair found for this file.");
    return;
  }

  console.log(`[rejectSingleChange] Found ${repairState.changes.length} changes`);

  const change = repairState.changes.find(
    c => c.range.start.line <= lineNumber && c.range.end.line >= lineNumber
  );

  if (!change) {
    console.log(`[rejectSingleChange] No change found for line ${lineNumber}`);
    return;
  }

  if (change.status !== 'pending') {
    console.log(`[rejectSingleChange] Change already processed: ${change.status}`);
    return;
  }

  console.log(`[rejectSingleChange] Rejecting change at lines ${change.range.start.line}-${change.range.end.line}`);

  // Mark as rejected
  change.status = 'rejected';

  // Find and update the editor
  let editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === uri.toString()
  );

  if (!editor) {
    // If editor not visible, try opening the document
    const doc = await vscode.workspace.openTextDocument(uri);
    editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
  }

  if (editor) {
    // Replace the new text with original text
    await editor.edit((editBuilder) => {
      editBuilder.replace(change.range, change.originalText);
    });

    // Force decoration update after text change
    // Wait a bit for the edit to complete
    setTimeout(() => {
      const currentEditor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === uri.toString()
      );
      if (currentEditor) {
        applyDecorations(currentEditor, repairState.changes);
      }
    }, 100);
  }

  // Update CodeLens to refresh buttons
  codeLensProvider.updateChangeStatus(uri, lineNumber, 'rejected');

  console.log(`✗ Change rejected, ${repairState.changes.filter(c => c.status === 'pending').length} remaining`);

  // Check if all changes are processed
  checkIfAllProcessed(uri, repairState, codeLensProvider);
}

export async function acceptAllChanges(uri: vscode.Uri, codeLensProvider: RepairCodeLensProvider) {
  const repairState = RepairStateManager.getInstance().getRepairState(uri);
  if (!repairState) {
    vscode.window.showWarningMessage("No pending AI repair found for this file.");
    return;
  }

  // Mark all as accepted
  for (const change of repairState.changes) {
    if (change.status === 'pending') {
      change.status = 'accepted';
    }
  }

  // Clear decorations
  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === uri.toString()
  );

  if (editor) {
    const decorationManager = DecorationManager.getInstance();
    editor.setDecorations(decorationManager.addedDecorationType, []);
    editor.setDecorations(decorationManager.removedDecorationType, []);
    await editor.document.save();
  }

  vscode.window.showInformationMessage("✓ All AI repairs accepted and saved!");

  // Clear state
  codeLensProvider.clearPendingChanges(uri);
  RepairStateManager.getInstance().clearRepairState(uri);
}

export async function rejectAllChanges(uri: vscode.Uri, codeLensProvider: RepairCodeLensProvider) {
  const repairState = RepairStateManager.getInstance().getRepairState(uri);
  if (!repairState) {
    vscode.window.showWarningMessage("No pending AI repair found for this file.");
    return;
  }

  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === uri.toString()
  );

  if (editor) {
    // Clear decorations using shared decoration manager
    const decorationManager = DecorationManager.getInstance();
    editor.setDecorations(decorationManager.addedDecorationType, []);
    editor.setDecorations(decorationManager.removedDecorationType, []);

    // Restore original code
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );

    await editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, repairState.originalCode);
    });

    vscode.window.showInformationMessage("✗ All AI repairs rejected. Original code restored.");
  }

  // Clear state
  codeLensProvider.clearPendingChanges(uri);
  RepairStateManager.getInstance().clearRepairState(uri);
}

async function checkIfAllProcessed(uri: vscode.Uri, repairState: any, codeLensProvider: RepairCodeLensProvider) {
  const pending = repairState.changes.filter((c: ChangeChunk) => c.status === 'pending');
  
  if (pending.length === 0) {
    // All changes processed - save and cleanup
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === uri.toString()
    );

  if (editor) {
    // Clear ALL decorations using the shared decoration manager
    const decorManager = DecorationManager.getInstance();
    editor.setDecorations(decorManager.addedDecorationType, []);
    editor.setDecorations(decorManager.removedDecorationType, []);
    await editor.document.save();
  }

    const accepted = repairState.changes.filter((c: ChangeChunk) => c.status === 'accepted').length;
    const rejected = repairState.changes.filter((c: ChangeChunk) => c.status === 'rejected').length;
    
    vscode.window.showInformationMessage(
      `✓ All changes processed! Accepted: ${accepted}, Rejected: ${rejected}`
    );

    // Clear state
    codeLensProvider.clearPendingChanges(uri);
    RepairStateManager.getInstance().clearRepairState(uri);
    
    console.log('[checkIfAllProcessed] All done, decorations cleared');
  } else {
    console.log(`[checkIfAllProcessed] ${pending.length} changes still pending`);
  }
}

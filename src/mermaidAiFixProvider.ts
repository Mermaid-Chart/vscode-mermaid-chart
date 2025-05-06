import * as vscode from "vscode";
 
 export class MermaidAICodeActionProvider implements vscode.CodeActionProvider {
   provideCodeActions(
     document: vscode.TextDocument,
     range: vscode.Range,
     context: vscode.CodeActionContext,
     token: vscode.CancellationToken
   ): vscode.ProviderResult<vscode.CodeAction[]> {
 
     const codeActions: vscode.CodeAction[] = [];
 
     for (const diagnostic of context.diagnostics) {
       if (diagnostic.message.toLowerCase().includes("error")) {
         const fixWithMermaidAI = new vscode.CodeAction(
           "Fix with Mermaid AI",
           vscode.CodeActionKind.QuickFix 
         );
 
         fixWithMermaidAI.command = {
           title: "Fix with Mermaid AI",
           command: "mermaid-ai.fixDiagram",
           arguments: [document, range, diagnostic],
         };
 
         fixWithMermaidAI.diagnostics = [diagnostic];
         fixWithMermaidAI.isPreferred = true; 
 
         codeActions.push(fixWithMermaidAI);
       }
     }
     return codeActions.length > 0 ? codeActions : undefined;
   }
 }




 
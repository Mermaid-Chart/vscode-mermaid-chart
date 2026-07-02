import httpClient from './httpClient';
import * as vscode from "vscode";
import * as packageJson from '../package.json';
class Analytics {

  public sendEvent(eventName: string, eventID:string, errorMessage?: string, diagramType?:string) {
    if (!vscode.env.isTelemetryEnabled) {
      return;
    }
    const analyticsID = vscode.env.machineId;
    const pluginID= packageJson.name === "vscode-mermaid-chart" ?  "MERMAIDCHART_VS_CODE_PLUGIN" : "MERMAID_PREVIEW_VS_CODE_PLUGIN";
    const payload = {
      analyticsID,
      pluginID,
      eventName,
      eventID,
      errorMessage,
      diagramType
    };

    httpClient.post('/rest-api/plugins/pulse', payload).catch(error => {
      console.error('Failed to send analytics event:', error);
    });
  }


  public trackException(error: any) {
    if (error instanceof Error) {
      this.sendEvent('VS Code Extension Exception', 'VS_CODE_PLUGIN_EXCEPTION', error.message);
    } else {
      this.sendEvent('VS Code Extension Exception','VS_CODE_PLUGIN_EXCEPTION', "Unknown error occurred");
    }
  }

  public trackLogin() {
    this.sendEvent('VS Code User Logged In','VS_CODE_PLUGIN_LOGIN');
  }

  public trackLogout() {
    this.sendEvent('VS Code User Logged Out','VS_CODE_PLUGIN_LOGOUT');
  }

  public trackAIChatInvocation() {
    this.sendEvent('VS Code AI Chat Participant Invoked','VS_CODE_PLUGIN_AI_CHAT_INVOCATION');
  }
  
  public trackAIGeneratedDiagram(diagramType: string) {
    this.sendEvent(`VS Code AI Chat Generated Diagram`, 'VS_CODE_PLUGIN_AI_CHAT_GENERATE_DIAGRAM', undefined, diagramType);
  }
  
  public trackRegenerateCommandInvoked() {
    this.sendEvent('VS Code Regenerate Command Invoked','VS_CODE_PLUGIN_REGENERATE_DIAGRAM');
  }

  // Pre-commit sync
  public trackPreCommitDiagramRegenerate() {
    this.sendEvent(
      "VS Code Pre-Commit Diagram Regenerate",
      "VS_CODE_PLUGIN_PRE_COMMIT_DIAGRAM_REGENERATE",
    );
  }

  // App review sync
  public trackAppReviewTriggered() {
    this.sendEvent(
      "VS Code Mermaid Sync App Review Triggered",
      "VS_CODE_PLUGIN_MERMAID_SYNC_APP_REVIEW_TRIGGERED",
    );
  }

  public trackReviewSyncOpenChanges() {
    this.sendEvent(
      "VS Code Mermaid Sync Review Open Changes",
      "VS_CODE_PLUGIN_MERMAID_SYNC_REVIEW_OPEN_CHANGES",
    );
  }

  public trackReviewSyncAcceptAll() {
    this.sendEvent(
      "VS Code Mermaid Sync Review Accept All",
      "VS_CODE_PLUGIN_MERMAID_SYNC_REVIEW_ACCEPT_ALL",
    );
  }

  public trackReviewSyncRejectAll() {
    this.sendEvent(
      "VS Code Mermaid Sync Review Reject All",
      "VS_CODE_PLUGIN_MERMAID_SYNC_REVIEW_REJECT_ALL",
    );
  }

  // Generate diagram from code
  public trackOpenCopilotChat() {
    this.sendEvent(
      "VS Code Open Chat @mermaid-chart CodeLens",
      "VS_CODE_PLUGIN_OPEN_COPILOT_CHAT_CODELENS",
    );
  }

  public trackGenerateDiagramFromCode() {
    this.sendEvent(
      "VS Code Generate Diagram From Code",
      "VS_CODE_PLUGIN_GENERATE_DIAGRAM_FROM_CODE",
    );
  }

  public trackImproveDiagramInvoked() {
    this.sendEvent(
      "VS Code Improve Diagram Invoked",
      "VS_CODE_PLUGIN_IMPROVE_DIAGRAM",
    );
  }

  public trackRepairDiagramInvoked() {
    this.sendEvent(
      "VS Code Repair Diagram Invoked",
      "VS_CODE_PLUGIN_REPAIR_DIAGRAM",
    );
  }

  // Diagram management
  public trackDiagramRenamed() {
    this.sendEvent(
      "VS Code Diagram Renamed",
      "VS_CODE_PLUGIN_DIAGRAM_RENAMED",
    );
  }

  public trackDiagramDeleted() {
    this.sendEvent(
      "VS Code Diagram Deleted",
      "VS_CODE_PLUGIN_DIAGRAM_DELETED",
    );
  }

  public trackDiagramDuplicated() {
    this.sendEvent(
      "VS Code Diagram Duplicated",
      "VS_CODE_PLUGIN_DIAGRAM_DUPLICATED",
    );
  }

  public trackDiagramAdded() {
    this.sendEvent(
      "VS Code Diagram Added",
      "VS_CODE_PLUGIN_DIAGRAM_ADDED",
    );
  }

  public trackViewDiagram() {
    this.sendEvent(
      "VS Code View Diagram In Mermaid Chart",
      "VS_CODE_PLUGIN_VIEW_DIAGRAM",
    );
  }

  public trackEditDiagramInMermaidChart() {
    this.sendEvent(
      "VS Code Edit Diagram In Mermaid Chart",
      "VS_CODE_PLUGIN_EDIT_DIAGRAM_IN_MERMAID_CHART",
    );
  }

  public trackEditDiagramLocally() {
    this.sendEvent(
      "VS Code Edit Diagram Locally",
      "VS_CODE_PLUGIN_EDIT_DIAGRAM_LOCALLY",
    );
  }

  // File sync / connect
  public trackConnectDiagramToMermaidChart() {
    this.sendEvent(
      "VS Code Connect Diagram To Mermaid Chart",
      "VS_CODE_PLUGIN_CONNECT_DIAGRAM",
    );
  }
}


export default new Analytics(); 
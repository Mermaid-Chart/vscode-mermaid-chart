import httpClient from './httpClient';
import * as vscode from "vscode";
class Analytics {

  public sendEvent(eventName: string, errorMessage?: string) {
    const analyticsID = vscode.env.machineId;
    const payload = {
      analyticsID,
      eventName,
      errorMessage,
    };

    httpClient.post('/rest-api/plugins/pulse', payload).catch(error => {
      console.error('Failed to send analytics event:', error);
    });
  }

  public trackActivation() {
      this.sendEvent('VS Code Extension Activated');
  }

  public trackException(error: any) {
    if (error instanceof Error) {
      this.sendEvent('VS Code Extension Exception', error.message);
    } else {
      this.sendEvent('VS Code Extension Exception', "Unknown error occurred");
    }
  }

  public trackLogin() {
    this.sendEvent('VS Code User Logged In');
  }

  public trackLogout() {
    this.sendEvent('VS Code User Logged Out');
  }
}

export default new Analytics(); 
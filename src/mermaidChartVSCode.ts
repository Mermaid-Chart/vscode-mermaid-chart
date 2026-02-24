import * as vscode from "vscode";
import { MermaidChart } from "@mermaidchart/sdk";
import { MermaidChartAuthenticationProvider } from "./mermaidChartAuthenticationProvider";
import { defaultBaseURL, updateViewVisibility } from "./util";
import { MermaidWebviewProvider } from "./panels/loginPanel";
import { MermaidChartProvider } from "./mermaidChartProvider";

export class MermaidChartVSCode extends MermaidChart {
  private context?: vscode.ExtensionContext;
  private mermaidWebviewProvider?: MermaidWebviewProvider;
  private mermaidChartProvider?: MermaidChartProvider;

  constructor() {
    const baseURL = getBaseUrl();
    const clientID = `469e30a6-2602-4022-aff8-2ab36842dc57`;
    super({
      baseURL,
      clientID,
    });
  }

  public async initialize(context: vscode.ExtensionContext, mermaidWebviewProvider?: MermaidWebviewProvider, mermaidChartProvider?: MermaidChartProvider) {
    this.context = context;
    this.mermaidWebviewProvider = mermaidWebviewProvider;
    this.mermaidChartProvider = mermaidChartProvider;
    await this.registerListeners(context, mermaidWebviewProvider);
    await this.setupAPI();
  }

  // Wrapper method to handle API errors and auto-logout on 403/unauthorized
  private async handleApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
      return await apiCall();
    } catch (error: any) {
      // Check if error is 403 or unauthorized
      if (this.isUnauthorizedError(error)) {
        console.log('Unauthorized API call detected, logging out user');
        await this.handleUnauthorizedError();
        throw error;
      }
      throw error;
    }
  }

  private isUnauthorizedError(error: any): boolean {
    // Check for 403 status code
    if (error?.status === 403 || error?.response?.status === 403) {
      return true;
    }
    
    // Check for 401 (unauthorized) status code
    if (error?.status === 401 || error?.response?.status === 401) {
      return true;
    }
    
    // Check for unauthorized in error message
    if (error?.message && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      return message.includes('unauthorized') || message.includes('forbidden') || message.includes('403') || message.includes('401');
    }
    
    return false;
  }

  private async handleUnauthorizedError(): Promise<void> {
    if (!this.context) {
      console.error('Context not available for handling unauthorized error');
      return;
    }

    try {
      // Log out the user
      await this.logout(this.context);
      
      // Update view visibility to show login screen
      updateViewVisibility(false, this.mermaidWebviewProvider);
      
      // Show error message to user
      vscode.window.showErrorMessage(
        'Your session has expired. Please log in again to continue using Mermaid Chart.',
        'Login'
      ).then(selection => {
        if (selection === 'Login') {
          vscode.commands.executeCommand('mermaidChart.login');
        }
      });
    } catch (logoutError) {
      console.error('Error during automatic logout:', logoutError);
    }
  }

  // Override API methods with error handling
  public async getProjects(): Promise<any> {
    return this.handleApiCall(() => super.getProjects());
  }

  public async getDocuments(projectId: string): Promise<any> {
    return this.handleApiCall(() => super.getDocuments(projectId));
  }

  public async getDocument(params: any): Promise<any> {
    return this.handleApiCall(() => super.getDocument(params));
  }

  public async setDocument(params: any): Promise<any> {
    return this.handleApiCall(() => super.setDocument(params));
  }

  public async createDocument(projectId: string): Promise<any> {
    return this.handleApiCall(() => super.createDocument(projectId));
  }

  public async repairDiagram(request: any): Promise<any> {
    return this.handleApiCall(() => super.repairDiagram(request));
  }

  public async getAICredits(): Promise<any> {
    return this.handleApiCall(() => super.getAICredits());
  }

  public async login() {
    await this.loginToMermaidChart();
  }

  public async loginWithToken(token: string) {
    await this.loginWithManualToken(token);
  }

  public async logout(context: vscode.ExtensionContext): Promise<void> {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true }
    );
  
    if (session) {
      const authProvider = MermaidChartAuthenticationProvider.getInstance(this, context);
      await authProvider.removeSession(session.id);
      vscode.window.showInformationMessage(`You have successfully signed out from ${session.account.id}.`);
    } else {
      vscode.window.showInformationMessage('No active session found. You are already signed out.');
    }
  }
  

  private async registerListeners(context: vscode.ExtensionContext, mermaidWebviewProvider?: MermaidWebviewProvider) {
    /**
     * Register the authentication provider with VS Code.
     * This will allow us to generate sessions when required
     */
    context.subscriptions.push(
      vscode.authentication.registerAuthenticationProvider(
        MermaidChartAuthenticationProvider.id,
        MermaidChartAuthenticationProvider.providerName,
        MermaidChartAuthenticationProvider.getInstance(this, context)
      )
    );

    
    /**
     * Sessions are changed when a user logs in or logs out.
     */
    context.subscriptions.push(
      vscode.authentication.onDidChangeSessions(async (e) => {
        if (e.provider.id === MermaidChartAuthenticationProvider.id) {
          const session = await vscode.authentication.getSession(
            MermaidChartAuthenticationProvider.id,
            [],
            { silent: true }
          );
          if (session) {
            this.setAccessToken(session.accessToken);
          } else {
            this.resetAccessToken();
          }
  
          if (!session) {
            await context.globalState.update("isUserLoggedIn", false);
            updateViewVisibility(false, mermaidWebviewProvider, this.mermaidChartProvider);
          } else {
            await context.globalState.update("isUserLoggedIn", true);
            updateViewVisibility(true, mermaidWebviewProvider, this.mermaidChartProvider);
          }
        }
      })
    );
    /**
     * When the configuration is changed, we need to refresh the base URL.
     */
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("mermaidChart.baseUrl")) {
        this.refreshBaseURL();
      }
    });
  }

  private async setupAPI() {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      {
        silent: true
      }
    );
    if (session) {
      this.setAccessToken(session.accessToken);
    }
  }

  private async loginToMermaidChart() {
    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      {
        createIfNone: true,
      }
    );
    this.setAccessToken(session.accessToken);
  }

  private async loginWithManualToken(token: string) {
    if (!this.context) {
      throw new Error('Extension context not available');
    }

    try {
      // Set the manual token in the auth provider
      const authProvider = MermaidChartAuthenticationProvider.getInstance(this, this.context);
      authProvider.setManualToken(token);
      
      // Use the same session creation flow as OAuth login
      // This will trigger the same session management events
      const session = await vscode.authentication.getSession(
        MermaidChartAuthenticationProvider.id,
        [],
        { createIfNone: true }
      );
      
      // Set the access token (this should happen automatically via session events, but just to be sure)
      this.setAccessToken(session.accessToken);
      
    } catch (error: any) {
      this.resetAccessToken();
      const errorMessage = error.message || 'Invalid token';
      // Throw custom error with token validation message - authentication provider will show it
      throw new Error(`Token validation failed: ${errorMessage}`);
    }
  }

  private async refreshBaseURL() {
    const baseURL = getBaseUrl();
    this.setBaseURL(baseURL);
  }
}


export function getBaseUrl(): string | undefined {
  const config = vscode.workspace.getConfiguration("mermaidChart");
  const baseURL = config.get<string>("baseUrl");

  if (baseURL) {
    return baseURL;
  }

  // If baseURL was not set, set it to default
  config.update("baseUrl", defaultBaseURL, true);
  return defaultBaseURL;
}
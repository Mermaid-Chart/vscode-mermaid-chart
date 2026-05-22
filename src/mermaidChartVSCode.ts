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
  private isInitializing = false;
  private logoutInProgress = false;

  constructor() {
    const baseURL = getBaseUrl();
    const clientID = `469e30a6-2602-4022-aff8-2ab36842dc57`;
    const requestTimeout = 120000; // The repair diagram API can take up to 120 seconds to complete
    super({
      baseURL,
      clientID,
      requestTimeout,
    });
  }

  public async initialize(context: vscode.ExtensionContext, mermaidWebviewProvider?: MermaidWebviewProvider, mermaidChartProvider?: MermaidChartProvider) {
    this.context = context;
    this.mermaidWebviewProvider = mermaidWebviewProvider;
    this.mermaidChartProvider = mermaidChartProvider;
    this.isInitializing = true;
    try {
      this.registerListeners(context, mermaidWebviewProvider);
      await this.setupAPI();
    } finally {
      this.isInitializing = false;
    }
  }

  /** Force-clear the initializing flag (used when a timeout races ahead of the real promise). */
  public clearInitializing(): void {
    this.isInitializing = false;
  }

  // Wrapper method to handle API errors and auto-logout on 403/unauthorized
  private async handleApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
      return await apiCall();
    } catch (error: any) {
      if (this.isUnauthorizedError(error)) {
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

    if (this.isInitializing) {
      console.debug('Skipping auto-logout during initialization');
      return;
    }

    const session = await vscode.authentication.getSession(
      MermaidChartAuthenticationProvider.id,
      [],
      { silent: true }
    );
    if (!session) {
      return;
    }

    if (this.logoutInProgress) {
      console.debug('Logout already in progress');
      return;
    }

    console.debug('Mermaid Chart API returned unauthorized; clearing stored session');
    this.logoutInProgress = true;
    try {
      // Log out the user - wrap in try-catch to handle cancellation
      try {
        await this.logout(this.context);
      } catch (logoutError: any) {
        // Only log logout errors, don't let them propagate
        if (logoutError && typeof logoutError === 'object') {
          const errorMsg = logoutError.message || String(logoutError);
          // Ignore cancellation errors as they're expected in some cases
          if (!errorMsg.includes('Canceled')) {
            console.error('Error during logout:', logoutError);
          }
        }
      }
      
      updateViewVisibility(false, this.mermaidWebviewProvider, this.mermaidChartProvider);

      setTimeout(() => vscode.commands.executeCommand("mermaidWebview.focus"), 300);

      vscode.window.showErrorMessage(
        'Your session has expired. Please log in again to continue using Mermaid Chart.',
        'Login'
      ).then(selection => {
        if (selection === 'Login') {
          vscode.commands.executeCommand('mermaidChart.login');
        }
      });
    } finally {
      this.logoutInProgress = false;
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

  public async deleteDocument(documentID: string): Promise<any> {
    return this.handleApiCall(() => super.deleteDocument(documentID));
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

    
    context.subscriptions.push(
      vscode.authentication.onDidChangeSessions(async (e) => {
        if (e.provider.id === MermaidChartAuthenticationProvider.id) {
          // During initialization the session is stale and API calls will 401.
          // Only set/reset the token; let the activation flow handle UI visibility.
          if (this.isInitializing) {
            try {
              const session = await Promise.race([
                vscode.authentication.getSession(MermaidChartAuthenticationProvider.id, [], { silent: true }),
                new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
              ]);
              if (session) {
                this.setAccessToken(session.accessToken);
              }
            } catch { /* ignore during init */ }
            return;
          }

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
    // getSession can hang if the system keychain is slow or VS Code's auth
    // internals are blocked. Use a 5-second timeout so activation continues.
    const session = await Promise.race([
      vscode.authentication.getSession(
        MermaidChartAuthenticationProvider.id,
        [],
        { silent: true }
      ),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5000)),
    ]);
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
/* eslint-disable @typescript-eslint/naming-convention */
import {
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationProviderSessionOptions,
  AuthenticationSession,
  Disposable,
  env,
  EventEmitter,
  ExtensionContext,
  ProgressLocation,
  Uri,
  UriHandler,
  window,
} from "vscode";
import { v4 as uuid } from "uuid";
import { PromiseAdapter, promiseFromEvent } from "./util";
import { MermaidChartVSCode } from "./mermaidChartVSCode";
import analytics from "./analytics";

const utmSource = 'mermaid_chart_vs_code';
const utmCampaign = "VSCode extension";

class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
  public handleUri(uri: Uri) {
    this.fire(uri);
  }
}

export class MermaidChartAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  static id = "mermaidchart";
  static providerName = "MermaidChart";
  private sessionsKey = `${MermaidChartAuthenticationProvider.id}.sessions`;
  private _sessionChangeEmitter =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: Disposable;
  private _codeExchangePromises = new Map<
    string,
    { promise: Promise<string>; cancel: EventEmitter<void> }
  >();
  private _uriHandler = new UriEventHandler();

  private static instance: MermaidChartAuthenticationProvider | null = null;

  static getInstance(
    mcAPI: MermaidChartVSCode,
    context: ExtensionContext
  ): MermaidChartAuthenticationProvider {
    if (!MermaidChartAuthenticationProvider.instance) {
      MermaidChartAuthenticationProvider.instance = new MermaidChartAuthenticationProvider(
        mcAPI,
        context
      );
    }
    return MermaidChartAuthenticationProvider.instance;
  }

  constructor(
    private readonly mcAPI: MermaidChartVSCode,
    private readonly context: ExtensionContext
  ) {
    this._disposable = Disposable.from(
      window.registerUriHandler(this._uriHandler)
    );
    this.mcAPI.setRedirectURI(this.redirectUri);
  }

  get onDidChangeSessions() {
    return this._sessionChangeEmitter.event;
  }

  get redirectUri() {
    const publisher = this.context.extension.packageJSON.publisher;
    const name = this.context.extension.packageJSON.name;
    return `${env.uriScheme}://${publisher}.${name}`;
  }

  /**
   * Get the existing sessions
   * @param scopes
   * @returns
   */
  public async getSessions(
    scopes: readonly string[] | undefined,
    options: AuthenticationProviderSessionOptions
  ): Promise<AuthenticationSession[]> {
    const allSessions = await this.context.secrets.get(this.sessionsKey);

    if (allSessions) {
      return JSON.parse(allSessions) as AuthenticationSession[];
    }

    return [];
  }

  /**
   * Create a new auth session
   * @param scopes
   * @returns
   */
  public async createSession(scopes: string[]): Promise<AuthenticationSession> {
    try {
      // Always offer choice between OAuth and token-based login
      const loginMethod = await this.chooseLoginMethod();
      
      if (loginMethod === 'token') {
        return await this.createSessionWithToken();
      }
      
      // Default OAuth flow
      await this.login(scopes);
      const token = await this.mcAPI.getAccessToken();
      if (!token) {
        throw new Error(`MermaidChart login failure`);
      }
      const user = await this.getUserInfo();
      const session: AuthenticationSession = {
        id: uuid(),
        accessToken: token,
        account: {
          label: user.fullName ? user.fullName:user.emailAddress,
          id: user.emailAddress,
        },
        scopes: [],
      };

      await this.context.secrets.store(
        this.sessionsKey,
        JSON.stringify([session])
      );

      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      window.showInformationMessage(`Signed in with ${session.account.id}`);
      return session;
    } catch (e) {
      window.showErrorMessage(`Sign in failed: ${e}`);
      analytics.trackException(e);
      throw e;
    }
  }

  /**
   * Choose login method (OAuth or Token-based)
   * Always offers both options equally in all environments
   * @returns Promise<'oauth' | 'token'>
   */
  private async chooseLoginMethod(): Promise<'oauth' | 'token'> {
    const isRemote = env.remoteName !== undefined;
    const tokenOptionText = isRemote 
      ? 'Use Personal Access Token (Recommended for remote environments)'
      : 'Use Personal Access Token';
    
    // Always offer both options equally
    const choice = await window.showInformationMessage(
      'Choose login method for Mermaid Chart',
      {
        modal: true,
      },
      'Use OAuth (Browser)',
      tokenOptionText
    );
    
    if (choice === tokenOptionText) {
      return 'token';
    }
    
    // Default to OAuth if user cancels or chooses OAuth
    return 'oauth';
  }

  /**
   * Create a session using a personal access token
   * @returns Promise<AuthenticationSession>
   */
  public async createSessionWithToken(): Promise<AuthenticationSession> {
    const baseURL = this.mcAPI.getBaseURL() || 'https://www.mermaidchart.com';
    const tokenUrl = `${baseURL}/settings/tokens`;
    
    // Show centered modal with instructions and option to open settings
    const action = await window.showInformationMessage(
      `To get your Personal Access Token, go to Settings → Secure tokens for plugins in your Mermaid Chart dashboard.`,
      { modal: true },
      'Open Settings Page',
      'I have my token'
    );

    if (action === 'Open Settings Page') {
      await env.openExternal(Uri.parse(tokenUrl));
      // Wait a bit for user to copy token
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else if (action === undefined) {
      // User cancelled the modal
      throw new Error('Token input cancelled');
    }

    // Prompt user for token in a centered input box
    const token = await window.showInputBox({
      title: 'Mermaid Chart Personal Access Token',
      prompt: 'Enter your Personal Access Token',
      placeHolder: 'Paste your token here...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Token cannot be empty';
        }
        return null;
      },
    });

    if (!token) {
      throw new Error('Token input cancelled');
    }

    // Validate token by making an API call
    const tempToken = token.trim();
    this.mcAPI.setAccessToken(tempToken);
    
    try {
      const user = await this.getUserInfo();
      
      // Token is valid, create session
      const session: AuthenticationSession = {
        id: uuid(),
        accessToken: tempToken,
        account: {
          label: user.fullName ? user.fullName : user.emailAddress,
          id: user.emailAddress,
        },
        scopes: [],
      };

      await this.context.secrets.store(
        this.sessionsKey,
        JSON.stringify([session])
      );

      console.log('[createSessionWithToken] Session stored, firing session change event');
      
      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      console.log('[createSessionWithToken] Login successful');
      
      await window.showInformationMessage(
        `Successfully signed in with ${session.account.id} using Personal Access Token`,
        { modal: false }
      );
      return session;
    } catch (error: any) {
      // Reset token on validation failure
      this.mcAPI.resetAccessToken();
      
      const errorMessage = error?.response?.status === 401 || error?.status === 401
        ? 'Invalid token. Please check your token and try again.'
        : `Token validation failed: ${error?.message || 'Unknown error'}`;
      
      // Show error in a centered modal dialog
      await window.showWarningMessage(
        errorMessage,
        { modal: true },
        'Try Again',
        'Cancel'
      );
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Remove an existing session
   * @param sessionId
   */
  public async removeSession(sessionId: string): Promise<void> {
    analytics.trackLogout();
    const allSessions = await this.context.secrets.get(this.sessionsKey);
    if (allSessions) {
      let sessions = JSON.parse(allSessions) as AuthenticationSession[];
      const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);
      this.mcAPI.resetAccessToken();
      await this.context.secrets.store(
        this.sessionsKey,
        JSON.stringify(sessions)
      );

      if (session) {
        this._sessionChangeEmitter.fire({
          added: [],
          removed: [session],
          changed: [],
        });
      }
    }
  }

  /**
   * Dispose the registered services
   */
  public async dispose() {
    this._disposable.dispose();
  }

  /**
   * Log in to MermaidChart
   */
  private async login(scopes: string[] = []) {
    return await window.withProgress<string>(
      {
        location: ProgressLocation.Notification,
        title: "Signing in to MermaidChart...",
        cancellable: true,
      },
      async (_, token) => {
        const authData = await this.mcAPI.getAuthorizationData({
          scope: scopes,
          trackingParams: {
            utm_source: utmSource,
            utm_medium: env.uriScheme,
            utm_campaign: utmCampaign,
          },
        });
        const uri = Uri.parse(authData.url);
        await env.openExternal(uri);

        const scope = authData.scope.join(" ");
        let codeExchangePromise = this._codeExchangePromises.get(scope);
        if (!codeExchangePromise) {
          codeExchangePromise = promiseFromEvent(
            this._uriHandler.event,
            this.handleUri(scopes)
          );
          this._codeExchangePromises.set(scope, codeExchangePromise);
        }

        try {
          return await Promise.race([
            codeExchangePromise.promise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject("Cancelled"), 60000)
            ),
            promiseFromEvent<any, any>(
              token.onCancellationRequested,
              (_, __, reject) => {
                reject("User Cancelled");
              }
            ).promise,
          ]);
        } finally {
          codeExchangePromise?.cancel.fire();
          this._codeExchangePromises.delete(scope);
        }
      }
    );
  }

  /**
   * Handle the redirect to VS Code (after sign in from Auth0)
   * @param scopes
   * @returns
   */
  private handleUri: (
    scopes: readonly string[]
  ) => PromiseAdapter<Uri, string> =
    (scopes) => async (uri, resolve, reject) => {
      await this.mcAPI.handleAuthorizationResponse(`?${uri.query}`);
      resolve("done");
    };

  private async getUserInfo() {
    return await this.mcAPI.getUser();
  }
}

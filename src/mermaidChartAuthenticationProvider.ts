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
  private _uriHandler = new UriEventHandler();

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
    scopes?: readonly string[],
    options?: AuthenticationProviderSessionOptions
  ): Promise<AuthenticationSession[]> {
    const allSessions = await this.context.secrets.get(this.sessionsKey);
    if (allSessions) {
      return JSON.parse(allSessions);
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
      await this.login(scopes);
      const token = await this.mcAPI.getAccessToken();
      if (!token) {
        throw new Error('Failed to get access token');
      }

      const user = await this.getUserInfo();
      const session: AuthenticationSession = {
        id: uuid(),
        accessToken: token,
        account: {
          label: user.fullName,
          id: user.emailAddress,
        },
        scopes: scopes,
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

      return session;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Sign in failed: ${message}`);
    }
  }

  /**
   * Remove an existing session
   * @param sessionId
   */
  public async removeSession(sessionId: string): Promise<void> {
    const allSessions = await this.context.secrets.get(this.sessionsKey);
    if (allSessions) {
      const sessions = JSON.parse(allSessions) as AuthenticationSession[];
      const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);
      
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
  public dispose() {
    this._disposable.dispose();
  }

  /**
   * Log in to MermaidChart
   */
  private async login(scopes: string[] = []): Promise<string> {
    return await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Signing in to MermaidChart...",
        cancellable: true,
      },
      async (_, token) => {
        try {
          const authData = await this.mcAPI.getAuthorizationData();
          const uri = Uri.parse(authData.url);
          await env.openExternal(uri);

          const codeExchangePromise = promiseFromEvent(
            this._uriHandler.event,
            this.handleUri(scopes)
          );

          return await Promise.race([
            codeExchangePromise.promise,
            new Promise<string>((_, reject) => {
              token.onCancellationRequested(() => {
                reject(new Error('Sign in cancelled'));
              });
            })
          ]);
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : 'Sign in failed');
        }
      }
    );
  }

  /**
   * Handle the redirect to VS Code (after sign in from Auth0)
   * @param scopes
   * @returns
   */
  private handleUri: (scopes: readonly string[]) => PromiseAdapter<Uri, string> =
    (scopes) => async (uri, resolve, reject) => {
      try {
        await this.mcAPI.handleAuthorizationResponse(
          new URLSearchParams(uri.query)
        );
        resolve('success');
      } catch (e) {
        reject(e instanceof Error ? e.message : 'Failed to handle authorization response');
      }
    };

  private async getUserInfo() {
    return await this.mcAPI.getUser();
  }
}

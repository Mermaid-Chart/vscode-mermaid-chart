import httpClient from './httpClient';
import * as vscode from 'vscode';
import * as packageJson from '../package.json';
import { isMermaidTelemetryEnabled } from './settings';

export type LoginTrigger = 'mermaid-sidebar' | 'preview-repair' | 'pre-commit' | 'hard-login-gate';
export type UpgradeFeature =
  | 'repair'
  | 'regenerate'
  | 'add_diagram'
  | 'duplicate_diagram'
  | 'connect_diagram';
export type EntryPoint =
  | 'chatParticipant'
  | 'codeLens'
  | 'commandPalette'
  | 'contextMenu'
  | 'hardLoginPopup'
  | 'markdownCodeBlock'
  | 'markdownPreview'
  | 'notification'
  | 'previewPanel'
  | 'sidebar'
  | 'slashCommand';

export type EventStatus = 'success' | 'error' | 'cancelled';
export type AiAction = 'generate' | 'improve' | 'repair' | 'regenerate' | 'openChat';
export type AiProvider = 'copilot' | 'mermaidAI';
export type OnCommitGenerateDecision = 'accepted' | 'dismissed';

export interface PulseEventOptions {
  diagramType?: string;
  entryPoint?: EntryPoint;
  isLinked?: boolean;
  status?: EventStatus;
  errorMessage?: string;
  errorType?: string;
  command?: string; // also used for slash command name on AI Action
  // Event 1
  aiAction?: AiAction;
  aiProvider?: AiProvider;
  sourceFileLanguage?: string;
  creditsRemaining?: number;
  durationMs?: number;
  // Event 2
  creationMethod?: 'command' | 'sidebarAdd' | 'aiGenerated' | 'markdownCodeBlock';
  // Event 3
  renderStatus?: 'success' | 'error';
  isFirstPreviewOfSession?: boolean;
  // Event 5 / 8 / 10 / 11
  action?: string;
  // Event 6
  syncAction?: 'connect' | 'push' | 'pull' | 'conflictShown' | 'conflictResolved';
  trigger?: LoginTrigger | 'save' | 'manual' | 'remoteChange' | string;
  conflictResolution?: 'keepLocal' | 'keepRemote' | 'cancelled';
  // Event 7
  reviewAction?:
    | 'reviewShown'
    | 'openReviewUI'
    | 'openFileDiff'
    | 'openChanges'
    | 'accept'
    | 'reject'
    | 'commit'
    | 'closeReview'
    | 'returnToReview';
  scope?: 'file' | 'all';
  fileCount?: number;
  // Event 8
  promptType?: 'newDiagram' | 'regenerate';
  linkedDiagramCount?: number;
  stagedFileCount?: number;
  // Event 9
  setupAction?: 'connectGitHub' | 'disconnectGitHub' | 'installAISkills';
  // Event 10
  limitType?: 'connectedDiagrams' | 'aiCredits' | 'other';
  blockedFeature?: string;
  feature?: string;
  source?: string;
  pluginSource?: 'vsCode';
  docsTopic?: string;
}

class Analytics {
  public sendEvent(eventName: string, eventID: string, options?: PulseEventOptions) {
    if (!isMermaidTelemetryEnabled()) {
      return;
    }
    const analyticsID = vscode.env.machineId;
    const pluginID =
      packageJson.name === 'vscode-mermaid-chart'
        ? 'MERMAIDCHART_VS_CODE_PLUGIN'
        : 'MERMAID_PREVIEW_VS_CODE_PLUGIN';
    const payload = {
      analyticsID,
      pluginID,
      eventName,
      eventID,
      extensionVersion: packageJson.version,
      vscodeVersion: vscode.version,
      ...options,
    };

    httpClient.post('/rest-api/plugins/pulse', payload).catch((error: unknown) => {
      console.error('Failed to send analytics event:', error);
    });
  }

  public trackException(
    error: unknown,
    feature?: string,
    command?: string,
    errorType?: string,
  ) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.sendEvent('VS Code Commercial Extension Exception', 'VS_CODE_COMMERCIAL_EXCEPTION', {
      errorMessage,
      errorType: errorType ?? this.classifyErrorType(error),
      feature,
      command,
    });
  }

  /** Map thrown errors to short slugs for Extension Exception / status=error events. */
  private classifyErrorType(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'unknown';
    }
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    if (
      name.includes('abort') ||
      message.includes('abort') ||
      message.includes('cancel')
    ) {
      return 'cancelled';
    }
    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('auth')
    ) {
      return 'authError';
    }
    if (
      message.includes('402') ||
      message.includes('credit') ||
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('limit exceeded')
    ) {
      return 'rateLimited';
    }
    if (
      message.includes('network') ||
      message.includes('fetch failed') ||
      message.includes('econn') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      message.includes('socket')
    ) {
      return 'networkError';
    }
    if (name.includes('syntax') || message.includes('parse error')) {
      return 'syntaxError';
    }
    if (name && name !== 'error') {
      return name.replace(/error$/i, '') || 'unknown';
    }
    return 'unknown';
  }

  // --- Event 1: AI Action ---
  public trackAiAction(options: {
    aiAction: AiAction;
    aiProvider: AiProvider;
    entryPoint?: EntryPoint;
    diagramType?: string;
    sourceFileLanguage?: string;
    status?: EventStatus;
    errorType?: string;
    durationMs?: number;
    creditsRemaining?: number;
    isLinked?: boolean;
    command?: string;
  }) {
    this.sendEvent('VS Code Commercial AI Action', 'VS_CODE_COMMERCIAL_AI_ACTION', options);
  }

  public trackRegenerateCommandInvoked() {
    this.trackAiAction({
      aiAction: 'regenerate',
      aiProvider: 'mermaidAI',
      entryPoint: 'commandPalette',
    });
  }

  public trackPreCommitDiagramRegenerate() {
    this.trackAiAction({
      aiAction: 'regenerate',
      aiProvider: 'mermaidAI',
      entryPoint: 'notification',
    });
  }

  public trackOpenCopilotChat() {
    this.trackAiAction({
      aiAction: 'openChat',
      aiProvider: 'copilot',
      entryPoint: 'codeLens',
    });
  }

  public trackImproveDiagramInvoked() {
    this.trackAiAction({
      aiAction: 'improve',
      aiProvider: 'mermaidAI',
      entryPoint: 'previewPanel',
    });
  }

  public trackRepairDiagram(status: 'success' | 'error') {
    this.trackAiAction({
      aiAction: 'repair',
      aiProvider: 'mermaidAI',
      entryPoint: 'previewPanel',
      status,
      errorType: status === 'error' ? 'syntaxError' : undefined,
    });
  }

  // --- Event 2: Diagram Created ---
  public trackDiagramCreated(
    creationMethod: 'command' | 'sidebarAdd' | 'aiGenerated' | 'markdownCodeBlock',
    entryPoint?: EntryPoint,
    extras: {
      diagramType?: string;
      isLinked?: boolean;
      status?: EventStatus;
      command?: string;
    } = {},
  ) {
    this.sendEvent('VS Code Commercial Diagram Created', 'VS_CODE_COMMERCIAL_DIAGRAM_CREATED', {
      creationMethod,
      entryPoint,
      diagramType: extras.diagramType || undefined,
      isLinked: extras.isLinked,
      status: extras.status ?? 'success',
      command: extras.command,
    });
  }

  public trackDiagramAdded(diagramType?: string, isLinked = true) {
    this.trackDiagramCreated('sidebarAdd', 'sidebar', {
      diagramType,
      isLinked,
      status: 'success',
    });
  }

  // --- Event 3: Diagram Previewed (first open of a preview panel / markdown block only) ---
  private hasPreviewedInSession = false;

  public trackDiagramPreviewed(
    entryPoint: 'codeLens' | 'commandPalette' | 'contextMenu' | 'markdownCodeBlock',
    details: {
      renderStatus?: 'success' | 'error';
      diagramType?: string;
      errorType?: string;
      errorMessage?: string;
      isLinked?: boolean;
    } = {},
  ) {
    const isFirstPreviewOfSession = !this.hasPreviewedInSession;
    this.hasPreviewedInSession = true;

    this.sendEvent('VS Code Commercial Diagram Previewed', 'VS_CODE_COMMERCIAL_DIAGRAM_PREVIEWED', {
      entryPoint,
      isFirstPreviewOfSession,
      ...details,
    });
  }

  // --- Event 4: Preview Export Action ---
  public trackPreviewExportAction(action: 'PNG' | 'SVG', diagramType?: string) {
    this.sendEvent('VS Code Commercial Preview Export Action', 'VS_CODE_COMMERCIAL_PREVIEW_EXPORT_ACTION', {
      action,
      diagramType,
    });
  }

  // --- Event 5: Diagram Managed ---
  public trackDiagramManaged(
    action:
      | 'rename'
      | 'delete'
      | 'duplicate'
      | 'link'
      | 'view'
      | 'editInMermaidChart'
      | 'editLocally'
      | 'refreshList'
      | 'share',
    entryPoint: EntryPoint = 'sidebar',
    status: EventStatus = 'success',
  ) {
    this.sendEvent('VS Code Commercial Diagram Managed', 'VS_CODE_COMMERCIAL_DIAGRAM_MANAGED', {
      action,
      entryPoint,
      status,
    });
  }

  public trackDiagramRenamed() {
    this.trackDiagramManaged('rename');
  }

  public trackDiagramDeleted() {
    this.trackDiagramManaged('delete');
  }

  public trackDiagramDuplicated() {
    this.trackDiagramManaged('duplicate');
  }

  public trackViewDiagram() {
    this.trackDiagramManaged('view');
  }

  public trackEditDiagramInMermaidChart() {
    this.trackDiagramManaged('editInMermaidChart');
  }

  public trackEditDiagramLocally() {
    this.trackDiagramManaged('editLocally');
  }

  public trackDiagramShared(status: EventStatus, errorType?: string) {
    this.sendEvent('VS Code Commercial Diagram Managed', 'VS_CODE_COMMERCIAL_DIAGRAM_MANAGED', {
      action: 'share',
      entryPoint: 'contextMenu',
      status,
      errorType,
    });
  }

  // --- Event 6: Diagram Synced ---
  public trackDiagramSynced(options: {
    syncAction: 'connect' | 'push' | 'pull' | 'conflictShown' | 'conflictResolved';
    trigger?: 'save' | 'manual' | 'remoteChange';
    conflictResolution?: 'keepLocal' | 'keepRemote' | 'cancelled';
    diagramType?: string;
    status?: EventStatus;
    errorType?: string;
  }) {
    this.sendEvent('VS Code Commercial Diagram Synced', 'VS_CODE_COMMERCIAL_DIAGRAM_SYNCED', options);
  }

  public trackConnectDiagramToMermaidChart(diagramType?: string) {
    this.trackDiagramSynced({
      syncAction: 'connect',
      trigger: 'manual',
      status: 'success',
      diagramType,
    });
  }

  public trackRemoteSync(diagramType?: string) {
    this.trackDiagramSynced({
      syncAction: 'conflictShown',
      trigger: 'remoteChange',
      status: 'success',
      diagramType,
    });
  }

  public trackConflictResolved(options: {
    conflictResolution: 'keepLocal' | 'keepRemote' | 'cancelled';
    diagramType?: string;
    status?: EventStatus;
    errorType?: string;
    trigger?: 'save' | 'manual' | 'remoteChange';
  }) {
    const payload = {
      syncAction: 'conflictResolved' as const,
      trigger: options.trigger ?? ('remoteChange' as const),
      conflictResolution: options.conflictResolution,
      diagramType: options.diagramType,
      status: options.status ?? ('success' as const),
      errorType: options.errorType,
    };
    // eslint-disable-next-line no-console -- verify conflictResolution in Extension Host while wiring PLUG-136
    console.info(
      {
        syncAction: payload.syncAction,
        conflictResolution: payload.conflictResolution,
        diagramType: payload.diagramType,
        status: payload.status,
      },
      '[Analytics] Diagram Synced conflictResolved',
    );
    this.trackDiagramSynced(payload);
  }

  public trackOpenDiagramDiff(diagramType?: string) {
    this.trackDiagramSynced({
      syncAction: 'conflictShown',
      trigger: 'manual',
      status: 'success',
      diagramType,
    });
  }

  public trackOpenCodeDiff(diagramType?: string) {
    this.trackDiagramSynced({
      syncAction: 'conflictShown',
      trigger: 'manual',
      status: 'success',
      diagramType,
    });
  }

  // --- Event 7: Mermaid Sync Review Action ---
  public trackReviewAction(options: {
    reviewAction:
      | 'reviewShown'
      | 'openReviewUI'
      | 'openFileDiff'
      | 'openChanges'
      | 'accept'
      | 'reject'
      | 'commit'
      | 'closeReview'
      | 'returnToReview';
    scope?: 'file' | 'all';
    fileCount?: number;
    status?: EventStatus;
    errorType?: string;
  }) {
    this.sendEvent(
      'VS Code Commercial Mermaid Sync Review Action',
      'VS_CODE_COMMERCIAL_MERMAID_SYNC_REVIEW_ACTION',
      options,
    );
  }

  // --- Event 8: Commit Prompt ---
  public trackCommitPrompt(options: {
    action: 'accepted' | 'dismissed' | 'shown';
    promptType?: 'newDiagram' | 'regenerate';
    linkedDiagramCount?: number;
    stagedFileCount?: number;
  }) {
    this.sendEvent('VS Code Commercial Commit Prompt', 'VS_CODE_COMMERCIAL_COMMIT_PROMPT', options);
  }

  public trackOnCommitDiagramGenerateShown(options?: {
    linkedDiagramCount?: number;
    stagedFileCount?: number;
  }) {
    this.trackCommitPrompt({
      action: 'shown',
      promptType: 'newDiagram',
      ...options,
    });
  }

  public trackOnCommitDiagramGenerationDecision(
    decision: OnCommitGenerateDecision,
    options?: { linkedDiagramCount?: number; stagedFileCount?: number },
  ) {
    this.trackCommitPrompt({
      action: decision,
      promptType: 'newDiagram',
      ...options,
    });
  }

  public trackOnCommitDiagramRegenerateShown(options?: {
    linkedDiagramCount?: number;
    stagedFileCount?: number;
  }) {
    this.trackCommitPrompt({
      action: 'shown',
      promptType: 'regenerate',
      ...options,
    });
  }

  public trackOnCommitDiagramRegenerateDecision(
    decision: OnCommitGenerateDecision,
    options?: { linkedDiagramCount?: number; stagedFileCount?: number },
  ) {
    this.trackCommitPrompt({
      action: decision,
      promptType: 'regenerate',
      ...options,
    });
  }

  // --- Event 9: Setup Action ---
  public trackSetupAction(
    setupAction: 'connectGitHub' | 'disconnectGitHub' | 'installAISkills',
    status: EventStatus = 'success',
  ) {
    this.sendEvent('VS Code Commercial Setup Action', 'VS_CODE_COMMERCIAL_SETUP_ACTION', {
      setupAction,
      status,
    });
  }

  public trackConnectGitHub() {
    this.trackSetupAction('connectGitHub');
  }

  public trackDisconnectGitHub() {
    this.trackSetupAction('disconnectGitHub');
  }

  public trackAiSkillsInstalled() {
    this.trackSetupAction('installAISkills');
  }

  // --- Event 10: Upgrade Prompt ---
  public trackUpgradePrompt(options: {
    action: 'shown' | 'clicked' | 'dismissed';
    blockedFeature?: UpgradeFeature | string;
    limitType?: 'connectedDiagrams' | 'aiCredits' | 'other';
    creditsRemaining?: number;
  }) {
    this.sendEvent('VS Code Commercial Upgrade Prompt', 'VS_CODE_COMMERCIAL_UPGRADE_PROMPT', {
      pluginSource: 'vsCode',
      ...options,
    });
  }

  public trackUpgradePromptShown(feature: UpgradeFeature) {
    this.trackUpgradePrompt({
      action: 'shown',
      blockedFeature: feature,
      limitType: feature === 'repair' || feature === 'regenerate' ? 'aiCredits' : 'connectedDiagrams',
    });
  }

  public trackUpgradePromptClicked(feature: UpgradeFeature) {
    this.trackUpgradePrompt({
      action: 'clicked',
      blockedFeature: feature,
      limitType: feature === 'repair' || feature === 'regenerate' ? 'aiCredits' : 'connectedDiagrams',
    });
  }

  // --- Event 11: user log in ---
  public trackUserLogin(options: {
    action: 'started' | 'completed' | 'logout';
    trigger?: LoginTrigger;
    status?: EventStatus;
    errorType?: string;
  }) {
    this.sendEvent('VS Code Commercial user log in', 'VS_CODE_COMMERCIAL_USER_LOG_IN', {
      pluginSource: 'vsCode',
      source: options.action === 'logout' ? undefined : 'login',
      ...options,
    });
  }

  public trackLogin() {
    this.trackUserLogin({ action: 'completed', status: 'success' });
  }

  public trackLogout() {
    this.trackUserLogin({ action: 'logout', status: 'success' });
  }

  public trackSignInCompleted(trigger: LoginTrigger) {
    this.trackUserLogin({ action: 'completed', trigger, status: 'success' });
  }

  public trackCreateAccountClick() {
    this.sendEvent(
      'VS Code Commercial Create Account Click',
      'VS_CODE_COMMERCIAL_CREATE_ACCOUNT_CLICK',
      { entryPoint: 'sidebar' },
    );
  }

  // Soft prompt shown/clicked removed (hard-login). Kept helpers below for later redesign.
  public trackHardLoginPromptShown(trigger: LoginTrigger) {
    this.sendEvent(
      'VS Code Commercial Hard Login Prompt Shown',
      'VS_CODE_COMMERCIAL_HARD_LOGIN_PROMPT_SHOWN',
      { trigger, entryPoint: 'hardLoginPopup' },
    );
  }

  public trackInstallationClick(entryPoint: EntryPoint = 'sidebar') {
    this.sendEvent(
      'VS Code Commercial Installation Click',
      'VS_CODE_COMMERCIAL_INSTALLATION_CLICK',
      { entryPoint },
    );
  }

  public trackShowMoreClick() {
    this.sendEvent('VS Code Commercial Show More Click', 'VS_CODE_COMMERCIAL_SHOW_MORE_CLICK', {
      entryPoint: 'hardLoginPopup',
    });
  }
}

export default new Analytics();

import axios from "axios";
import * as vscode from "vscode";
import * as packageJson from "../../package.json";
import httpClient from "../httpClient";
import { generateFeedbackWebviewContent } from "../templates/feedbackTemplate";

export const SIDEBAR_VIEW_CONTEXT_KEY = "mermaidChart:sidebarView";
export type ChartSidebarView = "home" | "improve" | "review" | "feedback" | "settings";

let currentSidebarView: ChartSidebarView = "home";

const LAST_FEEDBACK_SUBMITTED_AT_KEY = "mermaidChart.lastFeedbackSubmittedAt";
const FEEDBACK_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

/**
 * Set to true only while testing the extension-side feedback flow locally.
 * @todo Turn false before release.
 */
const feedbackRateLimitDisabledForTesting = false;

const VIEW_FOCUS_COMMAND: Record<ChartSidebarView, string> = {
  home: "mermaidChart.focus",
  improve: "mermaidImproveDiagram.focus",
  review: "mermaidReviewSync.focus",
  feedback: "mermaidFeedback.focus",
  settings: "mermaidSettings.focus",
};

interface FeedbackSubmission {
  activity: string;
  frequency: string;
  details: string;
  email: string;
}

/**
 * Feedback webview for sidebar mode `feedback`.
 * Shared Collab endpoint with Mermaid Preview — `pluginSource: "vsCodeMermaidChart"`.
 */
export class MermaidFeedbackWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mermaidFeedback";

  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "images"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    this.updateWebviewContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "submitFeedback") {
        await this.submitFeedback(message.feedback);
      }
      if (message.command === "ready") {
        this.postShowIntro();
      }
    });
  }

  refresh() {
    if (!this._view) {
      return;
    }
    this.updateWebviewContent();
    this.postShowIntro();
  }

  private updateWebviewContent() {
    if (this._view) {
      this._view.webview.html = generateFeedbackWebviewContent(
        this._view.webview,
        this.context.extensionUri
      );
    }
  }

  private postShowIntro() {
    void this._view?.webview.postMessage({ command: "showFeedbackIntro" });
  }

  private async submitFeedback(feedback: FeedbackSubmission | undefined) {
    if (
      !feedback ||
      !feedback.activity ||
      !feedback.frequency ||
      !feedback.details?.trim() ||
      !feedback.email?.trim()
    ) {
      this.postFeedbackResult("error", "Please complete all feedback fields.");
      return;
    }

    const lastSubmittedAt = feedbackRateLimitDisabledForTesting
      ? undefined
      : this.context.globalState.get<number>(LAST_FEEDBACK_SUBMITTED_AT_KEY);
    if (
      lastSubmittedAt !== undefined &&
      Date.now() - lastSubmittedAt < FEEDBACK_RATE_LIMIT_MS
    ) {
      const message = "You can only send one feedback submission every 24 hours.";
      void vscode.window.showWarningMessage(message);
      this.postFeedbackResult("rateLimited", message);
      return;
    }

    try {
      await httpClient.post("/rest-api/plugins/feedback", {
        activity: feedback.activity,
        frequency: feedback.frequency,
        details: feedback.details.trim(),
        email: feedback.email.trim(),
        pluginSource: "vsCodeMermaidChart",
        extensionVersion: packageJson.version,
      });
      await this.context.globalState.update(
        LAST_FEEDBACK_SUBMITTED_AT_KEY,
        feedbackRateLimitDisabledForTesting ? undefined : Date.now()
      );

      const message = "Thank you. Your feedback was sent.";
      void vscode.window.showInformationMessage(message);
      this.postFeedbackResult("success", message);
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message =
        status === 429
          ? "You can only send one feedback submission every 24 hours."
          : "Unable to send feedback. Please try again.";
      void vscode.window.showWarningMessage(message);
      this.postFeedbackResult(status === 429 ? "rateLimited" : "error", message);
    }
  }

  private postFeedbackResult(
    status: "success" | "error" | "rateLimited",
    message: string
  ) {
    void this._view?.webview.postMessage({ command: "feedbackResult", status, message });
  }
}

export async function setChartSidebarView(view: ChartSidebarView): Promise<void> {
  currentSidebarView = view;
  await vscode.commands.executeCommand("setContext", SIDEBAR_VIEW_CONTEXT_KEY, view);
}

export function getChartSidebarView(): ChartSidebarView {
  return currentSidebarView;
}

/** Switch sidebar mode and focus the matching view (only one visible at a time). */
export async function showChartSidebarMode(view: ChartSidebarView): Promise<void> {
  await setChartSidebarView(view);
  await vscode.commands.executeCommand(VIEW_FOCUS_COMMAND[view]);
}

/** Clicking an already-active mode (except home) returns to home. */
export async function toggleChartSidebarMode(view: ChartSidebarView): Promise<void> {
  if (currentSidebarView === view && view !== "home") {
    await showChartSidebarMode("home");
    return;
  }
  await showChartSidebarMode(view);
}

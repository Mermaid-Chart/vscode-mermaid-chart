import * as vscode from 'vscode';
import analytics, { type UpgradeFeature } from './analytics';
import { defaultBaseURL } from './config';

export function buildUpgradePricingUrl(feature: UpgradeFeature): string {
  const params = new URLSearchParams();
  params.set('utm_source', 'mermaid_chart_vs_code');
  params.set('utm_medium', 'vscode_upgrade');
  params.set('utm_campaign', feature);
  return `${defaultBaseURL}/app/user/billing?${params.toString()}`;
}

export async function openUpgradePricing(feature: UpgradeFeature): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(buildUpgradePricingUrl(feature)));
}

export async function showUpgradePrompt(
  feature: UpgradeFeature,
  message: string,
  upgradeLabel = 'Upgrade Subscription',
): Promise<void> {
  analytics.trackUpgradePromptShown(feature);
  const selection = await vscode.window.showErrorMessage(message, upgradeLabel);
  if (selection === upgradeLabel) {
    analytics.trackUpgradePromptClicked(feature);
    await openUpgradePricing(feature);
  }
}

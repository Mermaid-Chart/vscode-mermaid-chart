import type * as vscode from 'vscode';

const DEFAULT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // ~1 month

export interface InteractionCooldownOptions {
  globalState: vscode.Memento;
  /** Unique prefix for globalState keys, e.g. "createDiagramFromStage.prompt". */
  stateKeyPrefix: string;
  /**
   * When true (dev/testing): always allow the prompt and never read/write globalState.
   * When false (production): enforce interaction count + cooldown.
   */
  alwaysShow: boolean;
  /** How many recorded interactions before starting cooldown. Default 1. */
  maxInteractionsBeforeCooldown?: number;
  cooldownMs?: number;
}

interface CooldownState {
  interactionCount: number;
  cooldownUntil: number;
}

function stateKeys(prefix: string) {
  return {
    interactionCount: `${prefix}.interactionCount`,
    cooldownUntil: `${prefix}.cooldownUntil`,
  };
}

function readState(
  globalState: vscode.Memento,
  prefix: string,
): CooldownState {
  const keys = stateKeys(prefix);
  return {
    interactionCount: globalState.get<number>(keys.interactionCount, 0),
    cooldownUntil: globalState.get<number>(keys.cooldownUntil, 0),
  };
}

/** Returns true when the prompt is allowed to show. */
export function shouldShowPrompt(options: InteractionCooldownOptions): boolean {
  if (options.alwaysShow) {
    return true;
  }
  const { cooldownUntil } = readState(options.globalState, options.stateKeyPrefix);
  return Date.now() >= cooldownUntil;
}

/**
 * Record one user-facing interaction with the prompt.
 * After `maxInteractionsBeforeCooldown` interactions, starts a cooldown window.
 */
export async function recordInteraction(
  options: InteractionCooldownOptions,
): Promise<void> {
  if (options.alwaysShow) {
    return;
  }

  const max =
    options.maxInteractionsBeforeCooldown !== undefined
      ? options.maxInteractionsBeforeCooldown
      : 1;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const keys = stateKeys(options.stateKeyPrefix);
  const current = readState(options.globalState, options.stateKeyPrefix);
  const nextCount = current.interactionCount + 1;

  if (nextCount >= max) {
    await options.globalState.update(keys.interactionCount, 0);
    await options.globalState.update(keys.cooldownUntil, Date.now() + cooldownMs);
  } else {
    await options.globalState.update(keys.interactionCount, nextCount);
  }
}

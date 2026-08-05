import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5000;

/** Coding extensions eligible for generate-from-code / create-from-stage. */
export const CODING_FILE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw', '.pyi',
  '.java', '.kt', '.scala', '.groovy',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.cs', '.vb', '.fs', '.fsx',
  '.go',
  '.rs',
  '.php', '.phtml',
  '.rb', '.rbx',
  '.swift',
  '.dart', '.lua', '.perl', '.pl', '.r', '.m', '.mm',
  '.clj', '.cljs', '.elm', '.ex', '.exs', '.hs', '.jl',
  '.nim', '.pas', '.pp', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.ps1', '.psm1', '.psd1',
]);

export function isCodingSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext !== '' && CODING_FILE_EXTENSIONS.has(ext);
}

export function isMermaidFile(filePath: string): boolean {
  return filePath.endsWith('.mmd') || filePath.endsWith('.mermaid');
}

/** Run a git command asynchronously. Returns stdout/stderr or null on failure. */
export async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    console.error({ cwd, args, error }, 'GitStageHelpers: git command failed');
    return null;
  }
}

/**
 * All staged file absolute paths (ACMR only — Added, Copied, Modified, Renamed).
 * Deleted files are excluded so unstaging/discarding changes doesn't trigger a popup.
 * Returns null if git failed; empty array if nothing staged.
 *
 * Callers split this into source vs .mmd/.mermaid themselves, so a single git
 * invocation backs every consumer of one staging event.
 */
export async function getStagedPaths(
  repoRoot: string,
): Promise<string[] | null> {
  const stagedResult = await runGit(
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    repoRoot,
  );
  if (!stagedResult) {
    return null;
  }
  const stagedOutput = stagedResult.stdout.trim();
  if (!stagedOutput) {
    return [];
  }
  return stagedOutput
    .split('\n')
    .filter(Boolean)
    .map((p) => path.join(repoRoot, p));
}

/** Maps a unified diff (+/-/ ) into the [ADDED]/[REMOVED]/[CONTEXT] format. */
export function buildSourceFileContext(filePath: string, unifiedDiff: string): string {
  const lines: string[] = [];
  lines.push('=== DETAILED CHANGE SUMMARY ===');
  lines.push('Source File Changes:');
  lines.push(`MODIFIED: ${filePath} (changes detected)`);
  lines.push('');

  for (const line of unifiedDiff.replace(/\r\n?/g, '\n').split('\n')) {
    if (
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('@@')
    ) {
      continue;
    }
    if (line.startsWith('+')) {
      lines.push(`[ADDED]   ${line.slice(1)}`);
    } else if (line.startsWith('-')) {
      lines.push(`[REMOVED] ${line.slice(1)}`);
    } else if (line.startsWith(' ')) {
      lines.push(`[CONTEXT] ${line.slice(1)}`);
    }
  }

  return lines.join('\n');
}

export async function readFileAsAddedContext(
  absPath: string,
  relPath: string,
): Promise<string | undefined> {
  try {
    const content = (await fs.promises.readFile(absPath, 'utf-8')).replace(/\r\n?/g, '\n');
    const lines = content.split('\n').map((l) => `[ADDED]   ${l}`).join('\n');
    return `=== DETAILED CHANGE SUMMARY ===\nSource File Changes:\nADDED: ${relPath} (new file)\n\n${lines}`;
  } catch (error) {
    console.error({ absPath, error }, 'GitStageHelpers: failed to read source file');
    return undefined;
  }
}

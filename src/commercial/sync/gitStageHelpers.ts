import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
export const GIT_TIMEOUT_MS = 5000;

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
 * Staged source file absolute paths (ACMR only), excluding .mmd/.mermaid.
 * Returns null if git failed; empty array if nothing staged.
 */
export async function getStagedSourcePaths(
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
    .map((p) => path.join(repoRoot, p))
    .filter((p) => !p.endsWith('.mmd') && !p.endsWith('.mermaid'));
}

/**
 * Extract the resolved absolute file path from a reference string like "File: /src/auth.ts".
 *
 * Convention: a leading "/" in a reference means workspace-relative (not POSIX root).
 * Only Windows drive paths (e.g. C:\...) are treated as truly absolute and used as-is.
 */
export function resolveReferencePath(
  reference: string,
  workspacePath: string,
): string | undefined {
  const match = reference.match(/File: (.*?)(\s|$|\()/);
  if (!match) return undefined;

  const filePath = match[1].trim();
  if (!filePath.includes('/') && !filePath.includes('\\')) return undefined;

  if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
    return path.normalize(filePath);
  }

  if (workspacePath) {
    const relative = filePath.replace(/^[/\\]+/, '');
    return path.normalize(path.join(workspacePath, relative));
  }

  return path.normalize(filePath);
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

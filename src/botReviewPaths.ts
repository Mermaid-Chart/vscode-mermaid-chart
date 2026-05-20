import * as path from "path";
import { realpathSync } from "node:fs";

/** GitHub REST API version — avoids deprecation warnings for unversioned (2022-11-28) requests. */
export const GITHUB_REST_API_VERSION = "2026-03-10";

/**
 * Resolve an absolute path to the on-disk canonical form (symlinks, casing on Windows).
 * Falls back to normalized path when the file does not exist yet.
 */
export function resolveReviewFilePath(absolutePath: string): string {
  const normalized = path.normalize(absolutePath);
  try {
    return realpathSync.native(normalized);
  } catch {
    return normalized;
  }
}

/** Case-insensitive Map key for reviewed file paths (Windows explorer / VS Code URIs). */
export function reviewPathKey(absolutePath: string): string {
  const resolved = resolveReviewFilePath(absolutePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

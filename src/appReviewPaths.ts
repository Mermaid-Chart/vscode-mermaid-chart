import * as path from "path";

/** Repo-relative path with forward slashes (from git or path.relative). */
export function toPosixRepoPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Workspace absolute file → repo-relative posix path; null if outside gitRoot. */
export function relativePathFromAbsolute(gitRoot: string, absolutePath: string): string | null {
  const rel = path.relative(path.normalize(gitRoot), path.normalize(absolutePath));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return toPosixRepoPath(rel.split(path.sep).join("/"));
}

/** Match a relative path to a Map key (case-insensitive on Windows). */
export function findMapKeyForRelativePath(mapKeys: Iterable<string>, relPath: string): string | null {
  const posix = toPosixRepoPath(relPath);
  for (const key of mapKeys) {
    if (key === posix) {
      return key;
    }
  }
  if (process.platform === "win32") {
    const lower = posix.toLowerCase();
    for (const key of mapKeys) {
      if (key.toLowerCase() === lower) {
        return key;
      }
    }
  }
  return null;
}

/** Compare two absolute paths (case-insensitive on Windows). */
export function pathsEqualAbsolute(a: string, b: string): boolean {
  const na = path.normalize(a);
  const nb = path.normalize(b);
  if (process.platform === "win32") {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

/** Parent folder key for explorer decoration (relativePath is posix). */
export function repoRelativeParentDir(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === "." ? "" : dir;
}

/** HTTP status from Octokit / GitHub request errors. */
export function githubApiHttpStatus(error: unknown): number | undefined {
  if (error !== null && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

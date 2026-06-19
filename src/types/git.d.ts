/**
 * Minimal subset of the VS Code built-in Git extension API surface that this
 * extension consumes. Mirrors the public types from
 * https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 * — kept narrow so we only declare what we touch.
 */
import { Uri, Event, Disposable } from "vscode";

export interface GitExtension {
    readonly enabled: boolean;
    readonly onDidChangeEnablement: Event<boolean>;
    getAPI(version: 1): API;
}

export interface API {
    readonly state: "uninitialized" | "initialized";
    readonly onDidChangeState: Event<API["state"]>;
    readonly repositories: Repository[];
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;
    getRepository(uri: Uri): Repository | null;
    openRepository(root: Uri): Promise<Repository | null>;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly state: RepositoryState;
    log(options?: LogOptions): Promise<Commit[]>;
    show(ref: string, path: string): Promise<string>;
    checkout(treeish: string): Promise<void>;
    diffWithHEAD(path?: string): Promise<string>;
    add(paths: string[]): Promise<void>;
    commit(message: string, options?: { all?: boolean | "tracked"; amend?: boolean; signoff?: boolean }): Promise<void>;
    push(remote?: string, branch?: string, setUpstream?: boolean): Promise<void>;
    getConfig(key: string): Promise<string>;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly onDidChange: Event<void>;
    readonly workingTreeChanges: Change[];
    readonly indexChanges: Change[];
}

export interface Change {
    readonly uri: Uri;
    readonly originalUri: Uri;
    readonly renameUri?: Uri;
    readonly status: number;
}

export interface Branch {
    readonly name?: string;
    readonly commit?: string;
    readonly upstream?: { name: string; remote: string };
}

export interface Commit {
    readonly hash: string;
    readonly message: string;
    readonly parents: string[];
    readonly authorDate?: Date;
    readonly authorName?: string;
    readonly authorEmail?: string;
}

export interface LogOptions {
    readonly maxEntries?: number;
    readonly path?: string;
}

export type GitErrorCodes = string;

declare const _default: { readonly Disposable: Disposable };
export default _default;

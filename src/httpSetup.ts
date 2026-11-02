import axios, { AxiosInstance } from "axios";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as tls from "tls";
import * as vscode from "vscode";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

const CERT_HINT =
  "If you are behind a corporate TLS-inspecting proxy, set NODE_EXTRA_CA_CERTS to your company CA file.";
const PROXY_HINT =
  'If you are behind a corporate proxy, set VS Code\'s "http.proxy" or the HTTPS_PROXY / HTTP_PROXY environment variables.';

export interface NetworkSettings {
  proxy?: string;
  strictSSL: boolean;
  extraCa?: string;
}

export function resolveNetworkSettings(): NetworkSettings {
  const httpConfig = vscode.workspace.getConfiguration("http");
  const proxySupport = httpConfig.get<string>("proxySupport") ?? "override";
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  const vscodeProxy =
    proxySupport === "off" ? undefined : httpConfig.get<string>("proxy");
  const rawProxy = (vscodeProxy || envProxy || "").trim();
  const proxy = rawProxy ? normalizeProxyUrl(rawProxy) : undefined;
  const strictSSL = httpConfig.get<boolean>("proxyStrictSSL") ?? true;
  return {
    proxy,
    strictSSL,
    extraCa: loadExtraCaCerts(),
  };
}

export function loadExtraCaCerts(): string | undefined {
  const certPath = process.env.NODE_EXTRA_CA_CERTS;
  if (!certPath) {
    return undefined;
  }
  try {
    return fs.readFileSync(certPath, "utf8");
  } catch (error) {
    console.error(
      { certPath, error: error instanceof Error ? error.message : error },
      "Mermaid HTTP: failed to read NODE_EXTRA_CA_CERTS",
    );
    return undefined;
  }
}

export function applyAxiosNetworkConfig(instance?: AxiosInstance): void {
  const settings = resolveNetworkSettings();
  const tlsOpts = buildTlsOptions(settings);
  configureAxiosInstance(axios, settings.proxy, tlsOpts);
  if (instance) {
    configureAxiosInstance(instance, settings.proxy, tlsOpts);
  }
}

export function configureExtensionHttp(): void {
  applyAxiosNetworkConfig();
  configureFetchDispatcher();
}

export function wrapNetworkError(error: unknown): unknown {
  const formatted = formatNetworkError(error);
  if (!formatted) {
    return error;
  }
  const wrapped = new Error(formatted);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

export function formatNetworkError(error: unknown): string | undefined {
  const text = collectErrorText(error);
  if (!text) {
    return undefined;
  }
  if (isCertificateFailure(text)) {
    return `Could not verify the TLS certificate for Mermaid. ${CERT_HINT} Details: ${summarizeError(error)}`;
  }
  if (isProxyUnreachable(text)) {
    const proxy = resolveNetworkSettings().proxy;
    const where = proxy ? ` (${proxy})` : "";
    return `Could not connect to the proxy${where}. Start that proxy, or clear VS Code's "http.proxy" setting. Details: ${summarizeError(error)}`;
  }
  if (isProxyFailure(text)) {
    return `Could not reach Mermaid through the configured proxy. ${PROXY_HINT} Details: ${summarizeError(error)}`;
  }
  if (isUnreachableFailure(text)) {
    return `Could not reach Mermaid (mermaid.ai). ${PROXY_HINT} ${CERT_HINT} Details: ${summarizeError(error)}`;
  }
  return undefined;
}

function buildTlsOptions(settings: NetworkSettings): https.AgentOptions {
  const options: https.AgentOptions = {
    rejectUnauthorized: settings.strictSSL,
  };
  if (settings.extraCa) {
    options.ca = [...tls.rootCertificates, settings.extraCa];
  }
  return options;
}

function configureAxiosInstance(
  instance: AxiosInstance | typeof axios,
  proxy: string | undefined,
  tlsOpts: https.AgentOptions,
): void {
  instance.defaults.proxy = false;
  if (proxy) {
    instance.defaults.httpAgent = new HttpProxyAgent(proxy, tlsOpts);
    instance.defaults.httpsAgent = new HttpsProxyAgent(proxy, tlsOpts);
  } else if (tlsOpts.ca) {
    instance.defaults.httpAgent = new http.Agent(tlsOpts);
    instance.defaults.httpsAgent = new https.Agent(tlsOpts);
  }
}

function configureFetchDispatcher(): void {
  const settings = resolveNetworkSettings();
  const tlsOpts = buildTlsOptions(settings);
  try {
    // Node 18+ (recent VS Code). Ignore on older extension hosts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = require("node:undici") as {
      setGlobalDispatcher: (dispatcher: unknown) => void;
      ProxyAgent: new (opts: unknown) => unknown;
      Agent: new (opts: unknown) => unknown;
    };
    if (settings.proxy) {
      undici.setGlobalDispatcher(
        new undici.ProxyAgent({
          uri: settings.proxy,
          requestTls: {
            rejectUnauthorized: settings.strictSSL,
            ca: tlsOpts.ca,
          },
          connect: {
            rejectUnauthorized: settings.strictSSL,
            ca: tlsOpts.ca,
          },
        }),
      );
    } else if (tlsOpts.ca) {
      undici.setGlobalDispatcher(
        new undici.Agent({
          connect: {
            rejectUnauthorized: settings.strictSSL,
            ca: tlsOpts.ca,
          },
        }),
      );
    }
  } catch {
    // fetch dispatcher is best-effort; axios still covers REST calls.
  }
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (typeof current !== "object") {
      break;
    }
    const value = current as {
      message?: unknown;
      code?: unknown;
      cause?: unknown;
      error?: unknown;
    };
    if (typeof value.message === "string") {
      parts.push(value.message);
    }
    if (typeof value.code === "string" || typeof value.code === "number") {
      parts.push(String(value.code));
    }
    current = value.cause ?? value.error;
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isCertificateFailure(text: string): boolean {
  return (
    text.includes("certificate") ||
    text.includes("self signed") ||
    text.includes("self-signed") ||
    text.includes("unable to verify") ||
    text.includes("unable_to_verify") ||
    text.includes("cert_has_expired") ||
    text.includes("err_tls") ||
    text.includes("untrusted")
  );
}

function isProxyUnreachable(text: string): boolean {
  return (
    text.includes("failed to establish a socket connection to proxies") ||
    text.includes("tunneling socket could not be established") ||
    text.includes("err_proxy_connection_failed")
  );
}

function isProxyFailure(text: string): boolean {
  return (
    text.includes("407") ||
    text.includes("proxy") ||
    text.includes("tunneling socket") ||
    text.includes("status code 407")
  );
}

function isUnreachableFailure(text: string): boolean {
  return (
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("enetunreach") ||
    text.includes("eai_again") ||
    text.includes("network error") ||
    text.includes("fetch failed")
  );
}

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function normalizeProxyUrl(proxy: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(proxy)) {
    return proxy;
  }
  return `http://${proxy}`;
}

function redactProxy(proxy: string): string {
  try {
    const url = new URL(proxy);
    if (url.username) {
      url.username = "****";
    }
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return "(invalid proxy url)";
  }
}

configureExtensionHttp();
const applied = resolveNetworkSettings();
console.log(
  {
    proxy: applied.proxy ? redactProxy(applied.proxy) : undefined,
    strictSSL: applied.strictSSL,
    extraCa: Boolean(applied.extraCa),
  },
  "Mermaid HTTP: applied proxy/CA settings",
);

import * as assert from "assert";
import { formatNetworkError } from "../../httpSetup";

suite("httpSetup network errors", () => {
  test("formats certificate failures", () => {
    const error = Object.assign(new Error("unable to verify the first certificate"), {
      code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    });
    const message = formatNetworkError(error);
    assert.ok(message);
    assert.ok(message.includes("NODE_EXTRA_CA_CERTS"));
  });

  test("formats proxy failures", () => {
    const error = new Error("Request failed with status code 407");
    const message = formatNetworkError(error);
    assert.ok(message);
    assert.ok(message.includes("http.proxy"));
  });

  test("formats an unreachable proxy", () => {
    const error = new Error(
      "Failed to establish a socket connection to proxies: PROXY 127.0.0.1:8888",
    );
    const message = formatNetworkError(error);
    assert.ok(message);
    assert.ok(message.includes("Could not connect to the proxy"));
    assert.ok(message.includes('clear VS Code\'s "http.proxy"'));
  });

  test("formats unreachable failures", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const message = formatNetworkError(error);
    assert.ok(message);
    assert.ok(message.includes("mermaid.ai"));
  });

  test("leaves unrelated errors unchanged", () => {
    assert.strictEqual(formatNetworkError(new Error("diagram not found")), undefined);
  });
});

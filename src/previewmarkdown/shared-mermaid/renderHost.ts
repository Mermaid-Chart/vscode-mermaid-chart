const RENDER_HOST_ID = 'mermaid-render-host';

/**
 * Hidden, out-of-flow element that mermaid.render() draws its scratch SVG into.
 *
 * Without a container, mermaid appends a temporary div to <body>. Since v12 the default ELK
 * layout yields to the browser mid-render, so that div gets painted (and takes space in
 * flex/overflow-hidden webview layouts), showing up as a flicker on every re-render.
 */
export function getMermaidRenderHost(): HTMLElement {
    let host = document.getElementById(RENDER_HOST_ID);
    if (!host) {
        host = document.createElement('div');
        host.id = RENDER_HOST_ID;
        host.setAttribute('aria-hidden', 'true');
        // Off-screen but still laid out, so mermaid can measure text with getBBox().
        host.style.cssText =
            'position:absolute;top:0;left:-100000px;width:100vw;visibility:hidden;pointer-events:none;';
        document.body.appendChild(host);
    }
    return host;
}

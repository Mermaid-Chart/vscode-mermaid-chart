const assert = require("node:assert/strict");
const path = require("node:path");
const puppeteer = require("puppeteer");

async function main() {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
    try {
        const page = await browser.newPage();
        await page.setContent(`<!doctype html><html><head><span id="markdown-mermaid"></span></head><body>
            <div class="mermaid-chart">flowchart LR
                A["Visitors, API clients, &lt;br/&gt;mobile apps"] --&gt; B["Cloud WAF"]
            </div>
        </body></html>`);
        await page.addScriptTag({ path: path.join(__dirname, "../dist-preview/bundle.js") });
        await page.waitForSelector(".mc-md-viewport svg");
        await page.evaluate(() => {
            window.__exportedBlob = undefined;
            URL.createObjectURL = (blob) => {
                window.__exportedBlob = blob;
                return "blob:preview-export-test";
            };
            URL.revokeObjectURL = () => {};
            HTMLAnchorElement.prototype.click = () => {};
        });

        await page.hover(".mermaid-chart");
        await page.click('.mc-md-left button[aria-label="Export"]');
        await page.evaluate(() => {
            Array.from(document.querySelectorAll(".mc-md-menu.is-open button"))
                .find((button) => button.textContent === "SVG")
                ?.click();
        });
        const xml = await page.evaluate(() => window.__exportedBlob?.text());
        assert.ok(xml, "SVG export should create a download blob");

        const result = await page.evaluate((value) => {
            const document = new DOMParser().parseFromString(value, "image/svg+xml");
            return {
                isSvg: document.documentElement.localName === "svg",
                hasParserError: Boolean(document.querySelector("parsererror")),
                preservesLineBreak: document.getElementsByTagName("br").length > 0,
            };
        }, xml);
        assert.deepEqual(result, { isSvg: true, hasParserError: false, preservesLineBreak: true });
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

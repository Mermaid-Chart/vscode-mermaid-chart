import * as puppeteer from 'puppeteer';
import * as vscode from 'vscode';
import analytics from '../analytics';

let browser: puppeteer.Browser | null = null;

const getMermaidHTML = (isDarkTheme: boolean) => `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: ${isDarkTheme ? '#1e1e1e' : '#ffffff'};
        }
        .mermaid {
            display: flex;
            justify-content: center;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="mermaid"></div>
    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: '${isDarkTheme ? 'dark' : 'default'}',
            securityLevel: 'loose'
        });
    </script>
</body>
</html>
`;

export async function initializePuppeteer() {
    try {
        if (!browser) {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return browser;
    } catch (error) {
        console.error('Failed to initialize Puppeteer:', error);
        analytics.trackException(error);
        throw error;
    }
}

export async function closePuppeteer() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

export async function renderMermaidToPNG(
    code: string,
    isDarkTheme: boolean = false,
    maxZoom: number = 2
): Promise<Buffer> {
    try {
        const browser = await initializePuppeteer();
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ 
            width: 1200, 
            height: 800,
            deviceScaleFactor: maxZoom
        });

        // Set content and wait for it to load
        await page.setContent(getMermaidHTML(isDarkTheme));

        // Insert the diagram code
        await page.evaluate((diagramCode) => {
            const element = document.querySelector('.mermaid');
            if (!element) {
                throw new Error('Could not find Mermaid diagram element');
            }
            element.innerHTML = diagramCode;
        }, code);

        // Wait for rendering to complete
        await page.waitForSelector('.mermaid svg', { timeout: 10000 });

        // Get the diagram element
        const element = await page.$('.mermaid');
        if (!element) {
            throw new Error('Could not find Mermaid diagram element');
        }

        // Take screenshot
        const screenshot = await element.screenshot({
            type: 'png',
            omitBackground: true
        });

        await page.close();

        return Buffer.from(screenshot);
    } catch (error) {
        console.error('Error rendering Mermaid diagram to PNG:', error);
        analytics.trackException(error);
        throw error;
    }
}

export async function renderMermaidToSVG(
    code: string,
    isDarkTheme: boolean = false
): Promise<string> {
    try {
        const browser = await initializePuppeteer();
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1200, height: 800 });

        // Set content and wait for it to load
        await page.setContent(getMermaidHTML(isDarkTheme));

        // Insert the diagram code
        await page.evaluate((diagramCode) => {
            const element = document.querySelector('.mermaid');
            if (!element) {
                throw new Error('Could not find Mermaid diagram element');
            }
            element.innerHTML = diagramCode;
        }, code);

        // Wait for rendering to complete
        await page.waitForSelector('.mermaid svg', { timeout: 10000 });

        // Get the SVG content
        const svg = await page.evaluate(() => {
            const svgElement = document.querySelector('.mermaid svg');
            return svgElement ? svgElement.outerHTML : '';
        });

        await page.close();

        return svg;
    } catch (error) {
        console.error('Error rendering Mermaid diagram to SVG:', error);
        analytics.trackException(error);
        throw error;
    }
}

export async function renderSvgToPNG(
    svgString: string,
    theme: string,
    maxZoom: number = 2
): Promise<Buffer> {
    try {
        const browser = await initializePuppeteer();
        const page = await browser.newPage();

        // Set a larger viewport
        await page.setViewport({ 
            width: 6000,  // Increased width
            height: 4000, // Increased height
            deviceScaleFactor: maxZoom
        });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css"
                />
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                        background: ${theme?.includes("dark") ? "#171719" : "white"};
                    }
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .container {
                        position: relative;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        transform-origin: center center;
                        background: ${theme?.includes("dark") ? "#171719" : "white"};
                    }
                    #diagram svg {
                        display: block;
                        max-width: none !important;
                        width: auto !important;
                        height: auto !important;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div id="diagram">${svgString}</div>
                </div>
            </body>
            </html>
        `;

        await page.setContent(html);

        // Wait for fonts and content to load
        await Promise.all([
            page.waitForFunction(() => document.fonts.ready),
            page.waitForSelector('#diagram svg', { timeout: 10000 }), // Increased timeout
            page.waitForFunction(() => {
                const icons = document.querySelectorAll('.fa, .fas, .far');
                if (!icons.length) return true;
                return Array.from(icons).every(icon => {
                    const style = window.getComputedStyle(icon);
                    return style.fontFamily.includes('Font Awesome');
                });
            }, { timeout: 10000 }) // Increased timeout
        ]);

        // Get the SVG element
        const svgElement = await page.$('#diagram svg');
        if (!svgElement) {
            throw new Error('Could not find SVG element');
        }

        // Get the exact bounding box
        const boundingBox = await svgElement.boundingBox();
        if (!boundingBox) {
            throw new Error('Could not determine SVG dimensions');
        }

        // Calculate optimal padding based on diagram size
        const padding = Math.min(
            Math.max(20, Math.floor(boundingBox.width * 0.02)), // 2% of width, minimum 20px
            100 // maximum padding
        );

        // Ensure the diagram fits within the viewport
        const viewport = page.viewport();
        if (!viewport) {
            throw new Error('Could not get viewport dimensions');
        }
        const scale = Math.min(
            (viewport.width - padding * 2) / boundingBox.width,
            (viewport.height - padding * 2) / boundingBox.height,
            1 // Don't scale up, only down if needed
        );

        // Apply scaling if needed
        if (scale < 1) {
            await page.evaluate((s) => {
                const container = document.querySelector('.container') as HTMLElement;
                if (container) {
                    container.style.transform = `scale(${s})`;
                }
            }, scale);
        }

        // Recalculate boundingBox after scaling
        const newBoundingBox = await svgElement.boundingBox();
        if (!newBoundingBox) {
            throw new Error('Could not determine SVG dimensions after scaling');
        }

        const clip = {
            x: newBoundingBox.x - padding,
            y: newBoundingBox.y - padding,
            width: newBoundingBox.width + (padding * 2),
            height: newBoundingBox.height + (padding * 2)
        };

        // Take the screenshot
        const screenshot = await page.screenshot({
            type: 'png',
            clip,
            omitBackground: false
        });

        await page.close();
        return Buffer.from(screenshot);
    } catch (error) {
        console.error('Error rendering SVG to PNG:', error);
        analytics.trackException(error);
        throw error;
    }
} 
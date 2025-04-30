<script lang="ts">
  import mermaid from '@mermaid-chart/mermaid';
  import Panzoom from '@panzoom/panzoom';
  import { onMount } from 'svelte';
  import layouts from '@mermaid-chart/layout-elk';
  import { vscode } from './utility/vscode'
  import ErrorMessage from './ErrorMessage.svelte';
  import Sidebar from './Sidebar.svelte';
  import { diagramContent as diagramData } from './diagramData';

  $: diagramContent = diagramData;
 
  let errorMessage = "";
  let panzoomInstance: ReturnType<typeof Panzoom> | null = null;
  let panEnabled = false;
  let hasErrorOccured= false;
  let theme: 'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color' | 'mc' | 'null' = 'redux'; 
  $: zoomLevel = 100;
  let maxZoomLevel = 5;
  $: sidebarBackgroundColor = theme?.includes("dark")? "#4d4d4d" : "white";
  $: iconBackgroundColor = theme?.includes("dark") ? "#4d4d4d" : "white";
  $: svgColor = theme?.includes("dark") ? "white" : "#2329D6";
  $: shadowColor = theme?.includes("dark")? "#6b6b6b" : "#A3BDFF";


    async function initializeMermaid() {
      try {
        mermaid.registerLayoutLoaders(layouts);
        mermaid.registerIconPacks([
          {
            name: 'fa',
            loader: () => import('@iconify-json/fa6-regular').then((m) => m.icons),
          },
          {
            name: 'aws',
            loader: () => import('@mermaid-chart/icons-aws').then((m) => m.icons),
          },
          {
            name: 'azure',
            loader: () => import('@mermaid-chart/icons-azure').then((m) => m.icons),
          },
          {
            name: 'gcp',
            loader: () => import('@mermaid-chart/icons-gcp').then((m) => m.icons),
          },
        ]);
        await mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: theme,
        });
      } catch (error) {
        console.error('Error initializing Mermaid:', error);
      }
    }

  async function validateDiagramOnly(content: string) {
    try {
      await initializeMermaid();
      
      // Just parse the diagram without rendering
      await mermaid.parse(content || 'info');
      console.log('validationResult', true)
      // If no error was thrown, the diagram is valid
      vscode.postMessage({
        type: "validationResult",
        valid: true
      });
    } catch (error) {
      // Send back the validation error
      vscode.postMessage({
        type: "validationResult",
        valid: false,
        message: `Syntax error in text: ${error.message || error}`
      });
    }
  }

  async function renderDiagram() {
      await initializeMermaid();

    const element = document.getElementById("mermaid-diagram");
    if (element && diagramContent) {
      try {
        const parsed = await mermaid.parse(diagramContent || 'info')
        if (parsed?.config?.theme && 
            ['default', 'base', 'dark' , 'forest' , 'neutral' , 'neo' , 'neo-dark' , 'redux' , 'redux-dark' , 'redux-color' , 'redux-dark-color' , 'mc' , 'null'].includes(parsed.config.theme)) {
          theme = parsed.config.theme;
        }
        errorMessage = "";
        const currentScale = panzoomInstance?.getScale() || 1;
        const currentPan = panzoomInstance?.getPan() || { x: 0, y: 0 };
        const { svg } = await mermaid.render("diagram-graph", diagramContent);
        element.innerHTML = svg;
        if (theme?.includes("dark")) {
          element.style.backgroundColor= "#1e1e1e"
        } else {
          element.style.backgroundColor =  "white"
        }

        const svgElement = element.querySelector("svg");

        if (svgElement) {
          svgElement.style.height = "100%";
          svgElement.style.width = "auto";

          if (!panzoomInstance) {
          panzoomInstance = Panzoom(element, {
            maxScale: maxZoomLevel,
            minScale: 0.5,
            contain: "outside",
          });

          element.addEventListener("wheel", (event) => {
            panzoomInstance?.zoomWithWheel(event);
            updateZoomLevel();
          });        
        }

          panzoomInstance.zoom(currentScale, { animate: false });
          panzoomInstance.pan(currentPan.x, currentPan.y, { animate: false });

          updateCursorStyle();
        }
        if(hasErrorOccured){
          vscode.postMessage({
            type: "clearError", 
          });
          hasErrorOccured = false
        }
      } catch (error) {
        errorMessage = `Syntax error in text: ${error.message || error}`;
        vscode.postMessage({
          type: "error",
          message: errorMessage,
        });
        hasErrorOccured = true
        element.innerHTML = "";
      }
    }
  }

  function togglePan() {
    if (panzoomInstance) {
      panEnabled = !panEnabled;
      panzoomInstance.setOptions({ disablePan: !panEnabled });
      updateCursorStyle();
    }
  }

  function updateCursorStyle() {
    const element = document.getElementById("mermaid-diagram");
    if (element) {
      element.style.cursor = panEnabled ? `pointer` : 'default';
    }
  }
  function updateZoomLevel() {
    if (panzoomInstance) {
      zoomLevel = Math.round(panzoomInstance.getScale() * 100);
    }
  }

  function zoomIn() {
    panzoomInstance?.zoomIn();
    updateZoomLevel();
  }

  function zoomOut() {
    panzoomInstance?.zoomOut();
    updateZoomLevel();
  }

  function resetView() {
    panzoomInstance?.reset();
    updateZoomLevel();
  }

  function getSvgElement(): SVGElement | null {
    const element = document.getElementById("mermaid-diagram");
    return element?.querySelector("svg") ?? null;
  }

  async function exportSVG() {
    const svgElement = getSvgElement();
    if (!svgElement) {
      errorMessage = "Could not find SVG element to export.";
      return;
    }
    // Clone the SVG and remove transform to get original size/position
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    svgClone.style.transform = ''; // Reset any pan/zoom transforms for export
    svgClone.removeAttribute('transform'); // Also remove attribute if present
    svgClone.style.stroke = 'none'; // Remove potential border stroke
    svgClone.style.border = 'none'; // Remove potential CSS border

    let finalWidth: string | null = null;
    let finalHeight: string | null = null;

    // Ensure width and height are explicitly set if possible
    if (!svgClone.getAttribute('width') || !svgClone.getAttribute('height')) {
        // Cast to SVGGraphicsElement to access getBBox
        const bbox = (svgElement as SVGGraphicsElement).getBBox();
        // Add some padding
        const padding = 10;
        finalWidth = `${bbox.width + 2 * padding}`;
        finalHeight = `${bbox.height + 2 * padding}`;
        svgClone.setAttribute('width', finalWidth);
        svgClone.setAttribute('height', finalHeight);
        // Adjust viewBox to include padding
        svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`);
    } else {
        finalWidth = svgClone.getAttribute('width');
        finalHeight = svgClone.getAttribute('height');
    }


    // Add XML namespace if missing (important for standalone SVG)
    if (!svgClone.getAttribute('xmlns')) {
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // --- Add background rectangle ---
    const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('width', '100%'); // Use 100% to fill the SVG area
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', theme?.includes("dark") ? '#1e1e1e' : 'white');
    // Insert the rectangle as the first element so it's behind the diagram content
    svgClone.insertBefore(backgroundRect, svgClone.firstChild);
    // --- End background rectangle ---


    const svgString = new XMLSerializer().serializeToString(svgClone);

    vscode.postMessage({
      type: "exportDiagram",
      format: "svg",
      data: svgString
    });
    errorMessage = ""; // Clear any previous error
  }

  async function exportPNG() {
    const svgElement = getSvgElement();
     if (!svgElement) {
      errorMessage = "Could not find SVG element to export.";
      return;
    }

    // Similar cloning and dimension setting as SVG export
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    svgClone.style.transform = '';
    svgClone.removeAttribute('transform');

    let width = parseFloat(svgClone.getAttribute('width') || '0');
    let height = parseFloat(svgClone.getAttribute('height') || '0');
    const viewBox = svgClone.getAttribute('viewBox');

    if ((!width || !height) && viewBox) {
        const parts = viewBox.split(' ');
        if (parts.length === 4) {
            width = parseFloat(parts[2]);
            height = parseFloat(parts[3]);
            svgClone.setAttribute('width', `${width}`);
            svgClone.setAttribute('height', `${height}`);
        }
    }

    // Fallback using bounding box if still no dimensions
    if (!width || !height) {
        // Cast to SVGGraphicsElement to access getBBox
        const bbox = (svgElement as SVGGraphicsElement).getBBox();
        const padding = 10;
        width = bbox.width + 2 * padding;
        height = bbox.height + 2 * padding;
        svgClone.setAttribute('width', `${width}`);
        svgClone.setAttribute('height', `${height}`);
        svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    }

    if (!width || !height || width <= 0 || height <= 0) {
        errorMessage = "Could not determine valid dimensions for PNG export.";
        console.error("Invalid dimensions for PNG export:", width, height);
        return;
    }

    if (!svgClone.getAttribute('xmlns')) {
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Use a higher resolution for better quality, e.g., 2x
      const scaleFactor = 2;
      canvas.width = width * scaleFactor;
      canvas.height = height * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        errorMessage = "Could not get canvas context for PNG export.";
        URL.revokeObjectURL(url);
        return;
      }

      // Optional: Fill background if transparency is not desired
      ctx.fillStyle = theme?.includes("dark") ? '#1e1e1e' : 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scaleFactor, scaleFactor); // Scale context for higher resolution drawing
      ctx.drawImage(img, 0, 0, width, height); // Draw image at original size

      const pngDataUrl = canvas.toDataURL('image/png');
      URL.revokeObjectURL(url); // Clean up blob URL

      vscode.postMessage({
        type: "exportDiagram",
        format: "png",
        data: pngDataUrl // Send base64 data URL
      });
       errorMessage = ""; // Clear any previous error
    };

    img.onerror = (e) => {
      errorMessage = "Failed to load SVG into image for PNG export.";
      console.error("Image load error:", e);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  window.addEventListener("message", async (event) => {
    const { type, content, currentTheme, isFileChange, validateOnly } = event.data;
    if (type === "update") {
      if (validateOnly && content) {
        // Just validate without updating UI
        await validateDiagramOnly(content);
      } else if (content) {
        // Regular rendering flow
        diagramContent = content;
        theme = currentTheme;
        if (isFileChange) {
          panzoomInstance?.reset();
          updateZoomLevel();
        }
        await renderDiagram();
        if (panzoomInstance) {
          panzoomInstance.setOptions({ maxScale: maxZoomLevel });
        } 
      }
    }
  });

  onMount(async () => {
    const appElement = document.getElementById("app");
    const initialContent = appElement?.dataset.initialContent;
    const currentTheme = appElement?.dataset.currentTheme;
    if (initialContent) {
      diagramContent = decodeURIComponent(initialContent);
      theme = decodeURIComponent(currentTheme) as "default" | "base" | "dark" | "forest" | "neutral" | "null";
      renderDiagram();
    } else {
      renderDiagram();
      updateZoomLevel();
    }
  });
</script>

<style>
  #mermaid-diagram {
    height: 100vh;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #app-container {
    flex-direction: column;
    width: 100%;
    height: 100vh;
    background: white;
    gap: 10px;
  }
</style>


<div id="app-container">
  <ErrorMessage {errorMessage} />
  <div id="mermaid-diagram"></div>
  {#if !errorMessage}
    <Sidebar
      {panEnabled}
      {iconBackgroundColor}
      {sidebarBackgroundColor}
      {shadowColor}
      {svgColor}
      {zoomLevel}
      {togglePan}
      {zoomOut}
      {resetView}
      {zoomIn}
      {exportSVG}
      {exportPNG}
    />
  {/if}
</div>


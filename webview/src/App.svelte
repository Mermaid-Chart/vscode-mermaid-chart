<script lang="ts">
  import mermaid from '@mermaid-chart/mermaid';
  import Panzoom from '@panzoom/panzoom';
  import { onMount } from 'svelte';
  import layouts from '@mermaid-chart/layout-elk';
  import { vscode } from './utility/vscode'
  import ErrorMessage from './ErrorMessage.svelte';
  import Sidebar from './Sidebar.svelte';
  import { diagramContent as diagramData } from './diagramData';
  import LeftSideBar from './LeftSideBar.svelte';
  import ExportModal from './ExportModal.svelte';

  /** Default for dev; PR review / preview overwrites via data-initial-content or postMessage. */
  let diagramContent = diagramData;
 
  let errorMessage = "";
  let panzoomInstance: ReturnType<typeof Panzoom> | null = null;
  let panEnabled = false;
  let hasErrorOccured= false;
  let theme: 'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color' | 'mc' | 'null' = 'redux'; 
  $: zoomLevel = 100;
  let maxZoomLevel = 5;
  let maxTextSize = 90000;
  let maxEdges = 1000;
  let isExportModalOpen = false;
  let isPrReview = false;
  let isRepairing = false;
  let aiCredits = null; // AI credits data: {remaining: number, total: number}
  let isAuthenticated = false; // Authentication status
  $: sidebarBackgroundColor = theme?.includes("dark")? "#4d4d4d" : "white";
  $: iconBackgroundColor = theme?.includes("dark") ? "#4d4d4d" : "white";
  $: svgColor = theme?.includes("dark") ? "white" : "#2329D6";
  $: shadowColor = theme?.includes("dark")? "#6b6b6b" : "#A3BDFF";

  let panEventHandlers = {
    mouseDown: null,
    mouseUp: null,
    mouseLeave: null
  };

  function handleOpenExportModal() {
    isExportModalOpen = true;
  }

  function handleCloseExportModal() {
    isExportModalOpen = false;
  }

  function handleThemeChange(event) {
    const newTheme = event.detail.theme;
    theme = newTheme;
    renderDiagram();
  }

  function handleRepair() {
    if (!diagramContent || !errorMessage || isRepairing) {
      return;
    }
    
    isRepairing = true;
    
    // Send message to extension to call repair API
    vscode.postMessage({
      type: "repairDiagram",
      code: diagramContent,
      errorMessage: errorMessage
    });
  }

  function handleLogin() {
    // Send message to extension to trigger login flow
    vscode.postMessage({
      type: "login"
    });
  }

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
          {
            name: 'logos',
            loader: () => import('@iconify-json/logos').then((module) => module.icons),
          },
          {
            name: 'mdi',
            loader: () => import('@iconify-json/mdi').then((module) => module.icons),
          },
        ]);
        await mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: theme,
          maxEdges: maxEdges,
          maxTextSize: maxTextSize,
        });
      } catch (error) {
        console.error('Error initializing Mermaid:', error);
      }
    }

  async function validateDiagramOnly(content: string) {
    try {
      await initializeMermaid();
      await mermaid.parse(content || 'info');
      vscode.postMessage({
        type: "validationResult",
        valid: true
      });
    } catch (error) {
      vscode.postMessage({
        type: "validationResult",
        valid: false,
        message: `Syntax error in text: ${error.message || error}`
      });
    }
  }

  let wheelHandler = null;

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
        
        // Save current panzoom state before re-rendering
        const currentScale = panzoomInstance?.getScale() || 1;
        const currentPan = panzoomInstance?.getPan() || { x: 0, y: 0 };

        // Destroy existing panzoom instance to prevent conflicts
        if (panzoomInstance) {
          panzoomInstance.destroy();
          panzoomInstance = null;
        }
        
        const { svg } = await mermaid.render("diagram-graph", diagramContent);
        element.innerHTML = svg;
        if (theme?.includes("dark")) {
          element.style.backgroundColor= "#1e1e1e"
        } else {
          element.style.backgroundColor =  "white"
        }

        const svgElement = element.querySelector("svg");

        const nodes = svgElement.querySelectorAll('.node');
        nodes.forEach(node => {
          // For each node with an icon, ensure text has enough space
          const labelGroup = node.querySelector('.label');
          if (labelGroup) {
            const iconElement = labelGroup.querySelector('.fa, .fas, .far, .fab');
            if (iconElement) {
              // Find the text element and ensure it has enough space
              const foreignObject = labelGroup.querySelector('foreignObject');
              if (foreignObject) {
                // Make sure foreignObject is wide enough
                const currentWidth = parseInt(foreignObject.getAttribute('width') || '0', 10);
                if (currentWidth > 0) {
                  foreignObject.setAttribute('width', `${currentWidth + 30}px`);
                }
                
                // Ensure text doesn't wrap
                const divs = foreignObject.querySelectorAll('div');
                divs.forEach(div => {
                  div.style.whiteSpace = 'nowrap';
                  div.style.overflow = 'visible';
                });
              }
            }
          }
        });

        if (svgElement) {
          // Expand the viewBox to include ALL rendered content (e.g. pie chart legends
          // that Mermaid positions outside the original viewBox)
          const bbox = svgElement.getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            const pad = 10;
            svgElement.setAttribute("viewBox",
              `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`);
          }
          // Let the SVG scale to fit the container via CSS (preserveAspectRatio handles aspect ratio)
          svgElement.removeAttribute("width");
          svgElement.removeAttribute("height");
          svgElement.style.maxWidth = "100%";
          svgElement.style.maxHeight = "100%";
          svgElement.style.width = "auto";
          svgElement.style.height = "auto";

          // Remove existing wheel event listener to prevent duplicates
          if (wheelHandler) {
            element.removeEventListener("wheel", wheelHandler);
          }

          // Always create a new panzoom instance after re-rendering
          panzoomInstance = Panzoom(element, {
            maxScale: maxZoomLevel,
            minScale: 0.5,
            contain: "outside",
          });

          wheelHandler = (event) => {
            panzoomInstance?.zoomWithWheel(event);
            updateZoomLevel();
          };
          element.addEventListener("wheel", wheelHandler);

          // Re-apply constraints (prevents races where Panzoom booted with defaults)
          panzoomInstance.setOptions({ maxScale: maxZoomLevel, disablePan: !panEnabled });

          updateZoomLevel();

          // Restore zoom/pan state; clamp scale so a prior lower cap can't "stick"
          const clampedScale = Math.min(Math.max(currentScale, 0.5), maxZoomLevel);
          setTimeout(() => {
            if (panzoomInstance) {
              panzoomInstance.zoom(clampedScale, { animate: false });
              panzoomInstance.pan(currentPan.x, currentPan.y, { animate: false });
              updateZoomLevel();
            }
          }, 50);

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
        
        // Always request AI credits when error occurs
        vscode.postMessage({
          type: "requestAICredits"
        });
        
        // If aiCredits is null, request it again after a short delay to ensure it gets fetched
        if (!aiCredits) {
          setTimeout(() => {
            vscode.postMessage({
              type: "requestAICredits"
            });
          }, 100);
        }
        
        hasErrorOccured = true
        element.innerHTML = "";
      }
    }
  }

  function togglePan() {
    panEnabled = !panEnabled;
    
    if (panzoomInstance) {
      // Configure panzoom with the new state
      panzoomInstance.setOptions({ 
        disablePan: !panEnabled
      });
      
      // Remove event listeners if they exist
      if (panEventHandlers.mouseDown && panEventHandlers.mouseUp) {
        // PanZoom doesn't have an 'off' method, so we need to track our own DOM event handlers
        const element = document.getElementById("mermaid-diagram");
        if (element) {
          element.removeEventListener('panzoomstart', panEventHandlers.mouseDown);
          element.removeEventListener('panzoomend', panEventHandlers.mouseUp);
        }
      }
      
      if (panEnabled) {
        const element = document.getElementById("mermaid-diagram");
        if (element) {
          // Create event handlers
          panEventHandlers.mouseDown = () => {
            element.style.cursor = 'grabbing';
            console.log("PanZoom start");
          };
          
          panEventHandlers.mouseUp = () => {
            if (panEnabled) element.style.cursor = 'grab';
            console.log("PanZoom end");
          };
          
          // Connect to PanZoom's events using DOM event listeners
          element.addEventListener('panzoomstart', panEventHandlers.mouseDown);
          element.addEventListener('panzoomend', panEventHandlers.mouseUp);
          
          // Set initial cursor
          element.style.cursor = 'grab';
        }
      } else {
        // Reset cursor when pan is disabled
        const element = document.getElementById("mermaid-diagram");
        if (element) {
          element.style.cursor = 'default';
        }
      }
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

  function updateCursorStyle() {
    // Simply update cursor based on current panEnabled state
    const element = document.getElementById("mermaid-diagram");
    if (element) {
      element.style.cursor = panEnabled ? 'grab' : 'default';
    }
  }

  function centerOnNode(nodeId: string, autofocus = false, attempt = 0) {
    const element = document.getElementById("mermaid-diagram");
    if (!element || !nodeId) return;
    const svg = element.querySelector("svg");
    if (!svg && attempt < 24) {
      setTimeout(() => centerOnNode(nodeId, autofocus, attempt + 1), 120);
      return;
    }
    const groups = element.querySelectorAll("g.node, g.classGroup, g.stateGroup");
    for (const g of groups) {
      const id = g.getAttribute("id") || "";
      if (!id.split("-").includes(nodeId)) continue;
      if (!panzoomInstance) {
        g.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        return;
      }
      const targetScale = Math.min(
        maxZoomLevel,
        autofocus ? Math.max(1.85, panzoomInstance.getScale()) : Math.max(1.25, panzoomInstance.getScale()),
      );
      try {
        const bbox = (g as SVGGElement).getBBox();
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        const svgEl = svg as SVGSVGElement;
        const ctm = (g as SVGGElement).getScreenCTM();
        if (ctm && typeof panzoomInstance.zoomToPoint === "function") {
          const pt = svgEl.createSVGPoint();
          pt.x = cx;
          pt.y = cy;
          const screen = pt.matrixTransform(ctm);
          panzoomInstance.zoomToPoint(targetScale, { clientX: screen.x, clientY: screen.y }, { animate: true });
        } else {
          panzoomInstance.zoom(targetScale, { animate: true });
          const cw = element.clientWidth;
          const ch = element.clientHeight;
          panzoomInstance.pan(cw / (2 * targetScale) - cx, ch / (2 * targetScale) - cy, { animate: true });
        }
      } catch {
        const nodeRect = (g as SVGGElement).getBoundingClientRect();
        const containerRect = element.getBoundingClientRect();
        const scale = panzoomInstance.getScale();
        const pan = panzoomInstance.getPan();
        const dx = (containerRect.left + containerRect.width / 2 - (nodeRect.left + nodeRect.width / 2)) / scale;
        const dy = (containerRect.top + containerRect.height / 2 - (nodeRect.top + nodeRect.height / 2)) / scale;
        panzoomInstance.zoom(targetScale, { animate: true });
        panzoomInstance.pan(pan.x + dx, pan.y + dy, { animate: true });
      }
      return;
    }
    if (attempt < 24) {
      setTimeout(() => centerOnNode(nodeId, autofocus, attempt + 1), 120);
    }
  }

  window.addEventListener("message", async (event) => {
    const { type, content, currentTheme, isFileChange, validateOnly, maxZoom, maxCharLength, maxEdge, aiCredits: receivedAICredits, isAuthenticated: receivedAuth, fade, nodeId, autofocus } = event.data;
    if (type === "centerOnNode" && nodeId) {
      centerOnNode(nodeId, Boolean(autofocus));
      return;
    }
    if (type === "openExportModal") {
      handleOpenExportModal();
      return;
    }
    if (type === "update") {
      // Update authentication status if provided
      if (receivedAuth !== undefined) {
        isAuthenticated = receivedAuth;
        console.log('Authentication status updated:', isAuthenticated);
      }
      
      // Update AI credits if provided
      if (receivedAICredits) {
        console.log('Received AI credits:', receivedAICredits);
        aiCredits = receivedAICredits;
      }
      
      if (validateOnly && content) {
        // Just validate without updating UI
        await validateDiagramOnly(content);
      } else if (content) {
        // Regular rendering flow - do not overwrite theme so user's theme choice persists
        diagramContent = content;
        if (maxZoom != null && !Number.isNaN(Number(maxZoom))) {
          maxZoomLevel = maxZoom;
        }
        if (maxEdge != null && !Number.isNaN(Number(maxEdge))) {
          maxEdges = maxEdge;
        }
        if (maxCharLength != null && !Number.isNaN(Number(maxCharLength))) {
          maxTextSize = maxCharLength;
        }
        if (currentTheme) {
          const nextTheme = String(currentTheme).includes("%")
            ? decodeURIComponent(String(currentTheme))
            : String(currentTheme);
          theme = nextTheme as typeof theme;
        }
        // Apply options immediately so any reset/render uses the latest limits
        panzoomInstance?.setOptions({ maxScale: maxZoomLevel, disablePan: !panEnabled });
        if (isFileChange) {
          panzoomInstance?.reset();
          updateZoomLevel();
        }
        if (fade && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const diagramEl = document.getElementById("mermaid-diagram");
          if (diagramEl) {
            diagramEl.classList.remove("mc-review-fade");
            void diagramEl.offsetWidth;
            diagramEl.classList.add("mc-review-fade");
          }
        }
        await renderDiagram();
        panzoomInstance?.setOptions({ maxScale: maxZoomLevel, disablePan: !panEnabled });
      }
    } else if (type === "repairComplete") {
      // Repair is done, reset the repairing state and update credits if provided
      isRepairing = false;
      const { aiCredits: updatedCredits } = event.data;
      if (updatedCredits) {
        aiCredits = updatedCredits;
      }
    } else if (type === "aiCreditsUpdate") {
      // Handle AI credits and authentication update
      const { aiCredits: receivedCredits, isAuthenticated: receivedAuthStatus } = event.data;
      if (receivedCredits) {
        console.log('AI credits update received:', receivedCredits);
        aiCredits = receivedCredits;
      }
      if (receivedAuthStatus !== undefined) {
        isAuthenticated = receivedAuthStatus;
        console.log('Authentication status updated:', isAuthenticated);
      }
    }
  });

  onMount(async () => {
    const appElement = document.getElementById("app");
    isPrReview = appElement?.dataset.prReview === "true";
    const initialContent = appElement?.dataset.initialContent;
    const currentTheme = appElement?.dataset.currentTheme;
    const initialMaxZoom = appElement?.dataset.maxZoom;
    const initialMaxCharLength = appElement?.dataset.maxCharLength;
    const initialMaxEdges = appElement?.dataset.maxEdges;

    if (initialMaxZoom) {
      const parsed = Number(decodeURIComponent(initialMaxZoom));
      if (!Number.isNaN(parsed) && parsed > 0) maxZoomLevel = parsed;
    }
    if (initialMaxCharLength) {
      const parsed = Number(decodeURIComponent(initialMaxCharLength));
      if (!Number.isNaN(parsed) && parsed > 0) maxTextSize = parsed;
    }
    if (initialMaxEdges) {
      const parsed = Number(decodeURIComponent(initialMaxEdges));
      if (!Number.isNaN(parsed) && parsed > 0) maxEdges = parsed;
    }
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
    flex: 1;
    min-height: 0;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    padding: 16px;
    box-sizing: border-box;
  }

  :global(#mermaid-diagram.mc-review-fade) {
    animation: mc-review-pane-fade 240ms ease-out;
  }

  @keyframes mc-review-pane-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  :global(#mermaid-diagram.pan-enabled) {
    cursor: grab;
  }
  
  :global(#mermaid-diagram.pan-enabled:active) {
    cursor: grabbing;
  }
  
  #app-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    gap: 10px;
    overflow: hidden;
  }
  :global(#app[data-pr-review="true"]) #app-container {
    height: 100%;
  }
  .sidebar-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>


<div id="app-container" style="background: {theme?.includes('dark') ? '#1e1e1e' : 'white'}">
  <ErrorMessage {errorMessage} {isRepairing} {aiCredits} {isAuthenticated} on:repair={handleRepair} on:login={handleLogin} />
  <div id="mermaid-diagram"></div>
  <div class="sidebar-container">
    {#if !errorMessage}
    {#if !isPrReview}
    <LeftSideBar 
      {iconBackgroundColor} 
      {sidebarBackgroundColor} 
      {shadowColor} 
      {svgColor}
      currentTheme={theme}
      on:openExportModal={handleOpenExportModal}
      on:themeChange={handleThemeChange}
    />
    {/if}
    <Sidebar {panEnabled} {iconBackgroundColor} {sidebarBackgroundColor} {shadowColor} {svgColor} {zoomLevel} {togglePan} {zoomOut} {resetView} {zoomIn} />
  {/if}
  </div>

  <!-- Export Modal -->
  <ExportModal 
    isOpen={isExportModalOpen} 
    currentTheme={theme}
    on:close={handleCloseExportModal} 
  />
</div>


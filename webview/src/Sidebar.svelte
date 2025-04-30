<script>
  import PanIcon from "./PanIcon.svelte";
  import ZoomInIcon from "./ZoomInIcon.svelte";
  import ZoomOutIcon from "./ZoomOutIcon.svelte";
  import DownloadIcon from "./DownloadIcon.svelte";

    export let panEnabled, iconBackgroundColor, shadowColor, sidebarBackgroundColor, svgColor, zoomLevel;
    export let togglePan, zoomOut, resetView, zoomIn;
    export let exportPNG, exportSVG;
</script>

<style>
    .sidebar {
        position: absolute;
        top: 5px;
        right: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background-color: var(--sidebar-bg);
        border: 1px solid #ddd;
        padding: 4px;
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        transition: background-color 0.3s ease-in-out;
    }
    .zoom-level {
        font-size: 14px;
        font-weight: bold;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 5px;
        background-color: var(--icon-bg);
        transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    }
    .zoom-level span{
        color: var(--icon-bg);
    }
    .zoom-level:hover {
        box-shadow: 0px 0px 4px var(--shadow-color);
        background-color: var(--shadow-color); 
    }
    .icon {
        cursor: pointer;
        border: none;
        background-color: var(--icon-bg);
        padding: 3px;
        border-radius: 6px;
        transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon:hover {
        box-shadow: 0px 0px 4px var(--shadow-color);
        background-color: var(--shadow-color);
    }
    .icon.active {
        background-color: var(--shadow-color);
        box-shadow: 0px 0px 4px var(--shadow-color);
    }

    .icon span {
        width: 20px;
        height: 20px;
        color: var(--icon-bg);
        font-size: 15px;
        font-weight: 700;
    }
    .export-label {
        font-size: 12px;
        margin-left: 2px;
        color: var(--svg-color);
    }
    .icon span.reset-text {
        width: auto;
        height: auto;
        color: var(--svg-color);
        font-size: 15px;
        font-weight: 700;
    }
</style>
  
<div 
    class="sidebar"
    style="--sidebar-bg: {sidebarBackgroundColor};--shadow-color: {shadowColor}; --svg-color: {svgColor}"
  >
  <button class="icon {panEnabled ? 'active' : ''}" 
    style="--icon-bg: {iconBackgroundColor};"
    on:click={togglePan} 
    aria-label="Enable Pan"
    title="Enable Pan">
    <PanIcon stroke={svgColor} />
  </button>
  
  <button class="icon" style="--icon-bg: {iconBackgroundColor};" on:click={zoomOut} aria-label="Zoom Out" title="Zoom Out">
    <ZoomOutIcon stroke={svgColor} />
  </button>
  
  <button class="icon" style="--icon-bg: {iconBackgroundColor};" on:click={resetView} aria-label="Reset View" title="Reset View">
    <span class="reset-text">Reset</span>
  </button>
  
  <button class="icon" style="--icon-bg: {iconBackgroundColor};" on:click={zoomIn} aria-label="Zoom In" title="Zoom In">
    <ZoomInIcon fill={svgColor} />
  </button>
  
  <button class="icon" style="--icon-bg: {iconBackgroundColor};" on:click={exportSVG} aria-label="Export SVG" title="Export as SVG">
    <DownloadIcon stroke={svgColor} />
    <span class="export-label">SVG</span>
  </button>
  <button class="icon" style="--icon-bg: {iconBackgroundColor};" on:click={exportPNG} aria-label="Export PNG" title="Export as PNG">
    <DownloadIcon stroke={svgColor} />
    <span class="export-label">PNG</span>
  </button>
  
  <div class="zoom-level" style="--icon-bg: {iconBackgroundColor};">
    <span title="Zoom Level">Zoom: {zoomLevel}%</span>
  </div>
</div>
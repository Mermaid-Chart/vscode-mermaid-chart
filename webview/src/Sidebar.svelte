<script>
  import HandIcon from "./HandIcon.svelte";
  import ZoomInIcon from "./ZoomInIcon.svelte";
  import ZoomOutIcon from "./ZoomOutIcon.svelte";
  import FitAllIcon from "./FitAllIcon.svelte";

    export let panEnabled, iconBackgroundColor, shadowColor, sidebarBackgroundColor, svgColor, zoomLevel;
    export let togglePan, zoomOut, resetView, zoomIn;
    
    // Theme-aware icon colors
    $: isDarkTheme = sidebarBackgroundColor === "#4d4d4d";
    $: iconFillColor = isDarkTheme ? "#ffffff" : "#3B3B3B";
    $: activeIconFillColor = "#ffffff"; // Always white for active state to contrast with blue background
    
    // Diagram theme-aware text color
    $: isDarkDiagramTheme = sidebarBackgroundColor === "#4d4d4d";
    $: zoomTextColor = isDarkDiagramTheme ? "#ffffff" : "#3B3B3B";
</script>

  <style>
    .sidebar {
        position: absolute;
        top: 8px;
        right: 16px;
        display: flex;
        align-items: center;
        z-index: 100;
        gap: 0;
        background: var(--sidebar-bg);
        border-radius: 4px;
        padding: 4px;
    }
    
    .hand-section {
        display: flex;
        align-items: center;
        padding-right: 4px;
        border-right: 1px solid var(--divider-color);
        margin-right: 4px;
    }
    
    .zoom-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        padding-right: 4px;
        border-right: 1px solid var(--divider-color);
        margin-right: 8px;
    }
    
    .zoom-level {
        font-size: 14px;
        font-weight: 400;
        font-family: "Recursive", serif;
        color: var(--zoom-text-color);
    }
    
    .icon {
        cursor: pointer;
        border: none;
        background: none;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s ease-in-out;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        box-sizing: border-box;
    }

    .icon:hover {
        background-color: var(--hover-bg);
    }
    
    .icon.active {
        background-color: var(--active-bg);
    }
    
    /* Theme variables */
    .sidebar {
        --divider-color: var(--vscode-panel-border, #e1e5e9);
        --text-color: var(--vscode-foreground, #333333);
        --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(0, 0, 0, 0.1));
        --active-bg: var(--vscode-button-background, #0060c0);
        --sidebar-bg: #ffffff;
    }
    
    /* Dark theme adjustments */
    .sidebar.dark {
        --divider-color: var(--vscode-panel-border, #464647);
        --text-color: var(--vscode-foreground, #cccccc);
        --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
        --active-bg: var(--vscode-button-background, #0078d4);
        --sidebar-bg: #1E1E1E;
    }
  </style>
  
  <div 
      class="sidebar {isDarkTheme ? 'dark' : 'light'}"
    >
    <!-- Hand icon section -->
    <div class="hand-section">
      <button 
        class="icon {panEnabled ? 'active' : ''}" 
        on:click={togglePan} 
        aria-label="{panEnabled ? 'Disable Pan' : 'Enable Pan'}"
        title="{panEnabled ? 'Disable Pan' : 'Enable Pan'}">
        <HandIcon fill={panEnabled ? activeIconFillColor : iconFillColor} />
      </button>
    </div>
    
    <!-- Zoom controls section -->
    <div class="zoom-controls">
      <button 
        class="icon" 
        on:click={zoomOut} 
        aria-label="Zoom Out" 
        title="Zoom Out">
        <ZoomOutIcon fill={iconFillColor} />
      </button>
      
      <button 
        class="icon" 
        on:click={zoomIn} 
        aria-label="Zoom In" 
        title="Zoom In">
        <ZoomInIcon fill={iconFillColor} />
      </button>

      <button 
        class="icon" 
        on:click={resetView} 
        aria-label="Fit All" 
        title="Fit All">
        <FitAllIcon fill={iconFillColor} />
      </button>


    </div>
    
    <!-- Zoom level display -->
    <div class="zoom-level" style="--zoom-text-color: {zoomTextColor};">
      <span title="Current Zoom Level">Zoom {zoomLevel}%</span>
    </div>
  </div>
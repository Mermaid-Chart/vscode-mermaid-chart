<script>
  import HandIcon from "./HandIcon.svelte";
  import ZoomInIcon from "./ZoomInIcon.svelte";
  import ZoomOutIcon from "./ZoomOutIcon.svelte";
  import FitAllIcon from "./FitAllIcon.svelte";

    export let panEnabled, sidebarBackgroundColor, svgColor, accentColor, zoomLevel;
    export let togglePan, zoomOut, resetView, zoomIn;
    
    $: iconFillColor = svgColor;
    /** Icon on filled accent control (pan active) */
    $: activeIconFillColor = "#ffffff";
    
    // Determine if sidebar background is dark for text color
    $: isDarkSidebar = sidebarBackgroundColor?.includes('#1E1E1E') || sidebarBackgroundColor?.includes('#1F1F1F') || sidebarBackgroundColor?.includes('#000000');
    $: zoomTextColor = isDarkSidebar ? "#ffffff" : "#333333";
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
    
    /* Dynamic theme variables set via style attribute */
    .sidebar {
        --divider-color: rgba(0, 0, 0, 0.1);
        --hover-bg: rgba(0, 0, 0, 0.1);
        background: var(--sidebar-bg);
    }
    
    /* Dark sidebar adjustments */
    .sidebar.dark {
        --divider-color: rgba(255, 255, 255, 0.2);
        --hover-bg: rgba(255, 255, 255, 0.1);
    }
  </style>
  
  <div 
      class="sidebar {isDarkSidebar ? 'dark' : 'light'}"
      style="--sidebar-bg: {sidebarBackgroundColor}; --active-bg: {accentColor};"
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
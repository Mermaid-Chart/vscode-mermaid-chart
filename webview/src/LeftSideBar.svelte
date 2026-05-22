<script>
  import DownloadIcon from "./DownloadIcon.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import { createEventDispatcher } from 'svelte';

  export let sidebarBackgroundColor, svgColor;
  export let currentTheme;
  export let vscodeThemeColors;

  const dispatch = createEventDispatcher();

  // Use the smart icon colors passed from App.svelte
  $: iconFillColor = svgColor;
  
  // Determine if sidebar background is dark
  $: isDarkSidebar = sidebarBackgroundColor?.includes('#1E1E1E') || sidebarBackgroundColor?.includes('#1F1F1F') || sidebarBackgroundColor?.includes('#000000');

  function handleExportClick() {
    dispatch('openExportModal');
  }

  function handleCopyLink() {
    dispatch('copyLink');
  }

  function handleSaveDiagram() {
    dispatch('saveDiagram');
  }
</script>

<style>
  .left-sidebar {
    position: absolute;
    top: 8px;
    left: 16px;
    display: flex;
    align-items: center;
    z-index: 100;
    gap: 4px;
    background: var(--sidebar-bg);
    border-radius: 4px;
    padding: 4px;
  }
  
  .theme-container {
    position: relative;
    display: flex;
    align-items: center;
    padding-right: 4px;
    border-right: 1px solid var(--divider-color);
    margin-right: 4px;
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

  .save-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border: none;
    border-radius: 4px;
    background-color: #E0095F;
    color: #ffffff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
    white-space: nowrap;
    height: 32px;
    box-sizing: border-box;
    margin-left: 4px;
  }

  .save-btn:hover {
    background-color: #c40065;
  }

  .save-btn svg {
    flex-shrink: 0;
  }

  /* Theme variables (dynamically set via style attribute) */
  .left-sidebar {
    --hover-bg: rgba(0, 0, 0, 0.1);
    --divider-color: rgba(0, 0, 0, 0.1);
    background: var(--sidebar-bg);
  }
  
  /* Dark sidebar adjustments */
  .left-sidebar.dark {
    --hover-bg: rgba(255, 255, 255, 0.1);
    --divider-color: rgba(255, 255, 255, 0.2);
  }
</style>

<div class="left-sidebar {isDarkSidebar ? 'dark' : 'light'}" style="--sidebar-bg: {sidebarBackgroundColor};">
  <!-- Theme selector -->
  <div class="theme-container">
    <ThemeSelector 
      {svgColor} 
      {currentTheme}
      {vscodeThemeColors}
      on:themeChange
    />
  </div>
  
  <!-- Download button -->
  <button 
    class="icon" 
    on:click={handleExportClick} 
    aria-label="Export" 
    title="Export"
  >
    <DownloadIcon fill={iconFillColor} />
  </button>
  
  <!-- Copy link button -->
  <button
    class="icon"
    on:click={handleCopyLink}
    aria-label="Copy link"
    title="Copy shareable link"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill={iconFillColor}>
      <path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.55 7.45a.75.75 0 001.06 0l1.25-1.25a.75.75 0 10-1.06-1.06l-1.25 1.25a2 2 0 102.83 2.83l2.5-2.5a2 2 0 000-2.83.75.75 0 00-1.06 1.06 .5.5 0 010 .71l-2.5 2.5a.5.5 0 01-.71 0 .5.5 0 010-.71l1.25-1.25a.75.75 0 10-1.06-1.06l-1.25 1.25a2 2 0 000 2.83z"/>
    </svg>
  </button>

  <!-- Save Diagram button -->
  <button
    class="save-btn"
    on:click={handleSaveDiagram}
    aria-label="Save Diagram"
    title="Save diagram to Mermaid Chart"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#ffffff">
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
    </svg>
    Save Diagram
  </button>
</div>
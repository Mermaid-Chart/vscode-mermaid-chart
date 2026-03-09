<script>
  import DownloadIcon from "./DownloadIcon.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import { createEventDispatcher } from 'svelte';

  export let iconBackgroundColor, shadowColor, sidebarBackgroundColor, svgColor;
  export let currentTheme;

  const dispatch = createEventDispatcher();

  // Theme-aware icon colors
  $: isDarkTheme = sidebarBackgroundColor === "#4d4d4d";
  $: iconFillColor = isDarkTheme ? "#ffffff" : "#333333";

  function handleExportClick() {
    dispatch('openExportModal');
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

  /* Theme variables */
  .left-sidebar {
    --text-color: var(--vscode-foreground, #333333);
    --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(0, 0, 0, 0.1));
    --divider-color: var(--vscode-panel-border, #e1e5e9);
    --sidebar-bg: #ffffff;
  }
  
  /* Dark theme adjustments */
  .left-sidebar.dark {
    --text-color: var(--vscode-foreground, #cccccc);
    --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
    --divider-color: var(--vscode-panel-border, #464647);
    --sidebar-bg: #1E1E1E;
  }
</style>

<div class="left-sidebar {isDarkTheme ? 'dark' : 'light'}">
  <!-- Theme selector -->
  <div class="theme-container">
    <ThemeSelector 
      {iconBackgroundColor} 
      {shadowColor} 
      {sidebarBackgroundColor} 
      {svgColor} 
      {currentTheme}
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
</div>
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

  /* Dynamic theme variables set via style attribute */
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
</div>
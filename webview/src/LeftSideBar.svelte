<script>
  import ExportIcon from "./ExportIcon.svelte";
  import ThemeSelector from "./ThemeSelector.svelte";
  import { createEventDispatcher } from 'svelte';

  export let iconBackgroundColor, shadowColor, sidebarBackgroundColor, svgColor;
  export let currentTheme;

  const dispatch = createEventDispatcher();

  function handleExportClick() {
    dispatch('openExportModal');
  }

  function handleThemeChange(event) {
    dispatch('themeChange', event.detail);
  }
</script>

<style>
  .left-sidebar {
    position: absolute;
    top: 5px;
    left: 22px;
    display: flex;
    flex-direction: row;
    gap: 8px;
    z-index: 100;
    border-radius: 4px;
    padding: 4px;
  }
  
  .button-container {
    position: relative;
  }
  
  .icon {
    cursor: pointer;
    border: none;
    background-color: var(--icon-bg);
    padding: 14px;
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
  
  .export-label {
    position: absolute;
    top: -25px;
    left: 0;
    font-size: 12px;
    color: var(--svg-color);
    white-space: nowrap;
  }
</style>

<div 
  class="left-sidebar"
  style="--sidebar-bg: {sidebarBackgroundColor}; --shadow-color: {shadowColor}; --svg-color: {svgColor}"
>
  <!-- Theme Selector -->
  <div class="button-container">
    <ThemeSelector 
      {iconBackgroundColor} 
      {shadowColor} 
      {svgColor}
      {currentTheme}
      on:themeChange={handleThemeChange}
    />
  </div>
  
  <!-- Export Button -->
  <div class="button-container">
    <span class="export-label">export</span>
    <button 
      class="icon" 
      style="--icon-bg: {iconBackgroundColor};" 
      on:click={handleExportClick} 
      aria-label="Export" 
      title="Export"
    >
      <ExportIcon fill={svgColor} />
    </button>
  </div>
</div> 
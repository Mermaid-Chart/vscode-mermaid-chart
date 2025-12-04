<script>
  import PaletteIcon from '~icons/material-symbols/palette-outline';
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let iconBackgroundColor, shadowColor, svgColor;
  export let currentTheme;

  const dispatch = createEventDispatcher();

  let isDropdownOpen = false;
  
  // Available themes (excluding null and mc)
  const themes = [
    { key: 'mc', name: 'Mermaid Chart' },
    { key: 'neo', name: 'Neo' },
    { key: 'neo-dark', name: 'Neo Dark' },
    { key: 'default', name: 'Default' },
    { key: 'forest', name: 'Forest' },
    { key: 'base', name: 'Base' },
    { key: 'dark', name: 'Dark' },
    { key: 'neutral', name: 'Neutral' },
    { key: 'redux-dark', name: 'Redux Dark' },
    { key: 'redux-color', name: 'Redux Color' },
    { key: 'redux-dark-color', name: 'Redux Dark Color' },
  ];

  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen;
  }

  function selectTheme(themeKey) {
    dispatch('themeChange', { theme: themeKey });
    isDropdownOpen = false;
  }

  // Close dropdown when clicking outside
  function handleDocumentClick(event) {
    if (isDropdownOpen && !event.target.closest('.theme-container')) {
      isDropdownOpen = false;
    }
  }

  // Properly manage event listener
  $: {
    if (isDropdownOpen) {
      // Remove any existing listener first to prevent duplicates
      document.removeEventListener('click', handleDocumentClick);
      // Add the listener after a small delay to avoid immediate trigger
      setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 0);
    } else {
      document.removeEventListener('click', handleDocumentClick);
    }
  }

  // Cleanup on component destroy
  onDestroy(() => {
    document.removeEventListener('click', handleDocumentClick);
  });
</script>

<style>
  .theme-container {
    position: relative;
    display: inline-block;
  }
  
  .theme-button {
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

  .theme-button:hover {
    box-shadow: 0px 0px 4px var(--shadow-color);
    background-color: var(--shadow-color);
  }
  
  .theme-label {
    position: absolute;
    top: -25px;
    left: 0;
    font-size: 12px;
    color: var(--svg-color);
    white-space: nowrap;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--vscode-dropdown-background, #3c3c3c);
    border: 1px solid var(--vscode-dropdown-border, #464647);
    border-radius: 6px;
    min-width: 160px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    margin-top: 4px;
  }

  .dropdown-item {
    padding: 10px 14px;
    color: var(--vscode-dropdown-foreground, #cccccc);
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
  }

  .dropdown-item:hover {
    background-color: var(--vscode-list-hoverBackground, #2a2d2e);
  }

  .dropdown-item.selected {
    background-color: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #ffffff);
  }

  .dropdown-item:first-child {
    border-radius: 5px 5px 0 0;
  }

  .dropdown-item:last-child {
    border-radius: 0 0 5px 5px;
  }
</style>

<div class="theme-container">
  <span class="theme-label">theme</span>
  <button 
    class="theme-button" 
    style="--icon-bg: {iconBackgroundColor}; --shadow-color: {shadowColor}; --svg-color: {svgColor};" 
    on:click={toggleDropdown} 
    aria-label="Select Theme" 
    title="Select Theme"
  >
    <PaletteIcon color={svgColor} />
  </button>

  {#if isDropdownOpen}
    <div class="dropdown">
      {#each themes as theme}
        <button 
          class="dropdown-item {currentTheme === theme.key ? 'selected' : ''}"
          on:click={() => selectTheme(theme.key)}
        >
          {theme.name}
        </button>
      {/each}
    </div>
  {/if}
</div>
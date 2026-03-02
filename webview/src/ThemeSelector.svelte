<script>
  import ThemeIcon from "./ThemeIcon.svelte";
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let iconBackgroundColor, shadowColor, sidebarBackgroundColor, svgColor;
  export let currentTheme;

  const dispatch = createEventDispatcher();

  // Theme-aware icon colors
  $: isDarkTheme = sidebarBackgroundColor === "#4d4d4d";
  $: iconFillColor = isDarkTheme ? "#ffffff" : "#333333";
  
  // Diagram theme-aware dropdown colors
  $: isDarkDiagramTheme = currentTheme?.includes('dark') || currentTheme === 'dark';
  $: dropdownBg = isDarkDiagramTheme ? "#1e1e1e" : "#ffffff";
  $: dropdownBorder = isDarkDiagramTheme ? "#464647" : "#e1e5e9";
  $: dropdownTextColor = isDarkDiagramTheme ? "#cccccc" : "#333333";
  $: dropdownHoverBg = isDarkDiagramTheme ? "#2A2D2E" : "#f0f0f0";
  $: dropdownSelectedBg = isDarkDiagramTheme ? "#04395e" : "#0078d4";
  $: dropdownSelectedText = "#ffffff";

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
    display: flex;
    align-items: center;
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
    background-color: var(--hover-bg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--dropdown-bg);
    border: 1px solid var(--dropdown-border);
    border-radius: 4px;
    min-width: 160px;
    z-index: 1000;
    box-shadow: 0px 4px 14px 0px #00000024;
    margin-top: 4px;
  }

  .dropdown-title {
    padding: 8px 14px;
    color: var(--dropdown-text);
    font-size: 12px;
    font-weight: normal;
    cursor: pointer;
    background: none;
    width: 100%;
    text-align: left;
    border-bottom: 1px solid var(--dropdown-border);
  }

  .dropdown-item {
    padding: 8px 14px;
    color: var(--dropdown-text);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    position: relative;
  }

  .dropdown-item:hover {
    background-color: var(--dropdown-hover-bg);
  }

  .dropdown-item.selected {
    background-color: var(--dropdown-selected-bg);
    color: var(--dropdown-selected-text);
  }

  /* Theme variables */
  .theme-container {
    --text-color: var(--vscode-foreground, #333333);
    --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(0, 0, 0, 0.1));
  }
  
  /* Dark theme adjustments */
  .theme-container.dark {
    --text-color: var(--vscode-foreground, #cccccc);
    --hover-bg: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
  }
</style>

<div class="theme-container {isDarkTheme ? 'dark' : 'light'}">
  <button 
    class="icon {isDropdownOpen ? 'active' : ''}" 
    on:click={toggleDropdown} 
    aria-label="Select Theme" 
    title="Select Theme"
  >
    <ThemeIcon fill={iconFillColor} />
  </button>

  {#if isDropdownOpen}
    <div class="dropdown" style="--dropdown-bg: {dropdownBg}; --dropdown-border: {dropdownBorder}; --dropdown-text: {dropdownTextColor}; --dropdown-hover-bg: {dropdownHoverBg}; --dropdown-selected-bg: {dropdownSelectedBg}; --dropdown-selected-text: {dropdownSelectedText};">
      <div class="dropdown-title">Themes</div>
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
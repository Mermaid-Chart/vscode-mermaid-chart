<script>
  import ThemeIcon from "./ThemeIcon.svelte";
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let svgColor;
  export let currentTheme;
  export let vscodeThemeColors;

  const dispatch = createEventDispatcher();

  $: isDarkDiagram = currentTheme?.includes('dark') || currentTheme === 'dark';
  $: iconFillColor = svgColor;

  // Always use the actual vscodeThemeColors surfaces. Adapt text color based on whether
  // the VS Code theme itself is dark (isDark=true → light text, isDark=false → dark text).
  $: dropdownBg = isDarkDiagram ? vscodeThemeColors.modalBackground : '#ffffff';
  $: dropdownBorder = isDarkDiagram ? vscodeThemeColors.secondaryBackground : '#c8c8c8';
  $: dropdownTextColor = isDarkDiagram ? (vscodeThemeColors.isDark ? '#cccccc' : '#333333') : '#333333';
  $: dropdownHoverBg = isDarkDiagram ? vscodeThemeColors.secondaryBackground : '#e8e8e8';
  $: dropdownSelectedBg = isDarkDiagram ? vscodeThemeColors.accentColor : '#0060C0';
  $: dropdownSelectedText = isDarkDiagram ? (vscodeThemeColors.isDark ? '#ffffff' : '#333333') : '#ffffff';

  let isDropdownOpen = false;
  
  import { MERMAID_PREVIEW_THEMES } from './themes/previewThemes';

  const themes = MERMAID_PREVIEW_THEMES;

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
    overflow: hidden;
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

<div class="theme-container {isDarkDiagram ? 'dark' : 'light'}">
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
<script lang="ts">
  import { createEventDispatcher, onMount, afterUpdate } from 'svelte';
  import { exportPng, exportSvg } from './services/exportService';
  import mermaid from '@mermaid-chart/mermaid';
  
  export let isOpen = false;
  export let currentTheme: string;
  
  const dispatch = createEventDispatcher();
  
  let selectedFormat: 'png' | 'svg' = 'png';
  let selectedTheme: 'auto' | 'light' | 'dark' | 'custom' = 'auto';
  let customBackgroundColor: string = '#ffffff';
  let previewElement: HTMLElement;
  
  // Preview diagram based on selected theme
  $: previewTheme = getPreviewTheme(selectedTheme, currentTheme);
  $: previewBackgroundColor = getPreviewBackgroundColor(selectedTheme, customBackgroundColor, currentTheme);
  
  // Reset modal state when opening
  $: if (isOpen) {
    resetModalState();
  }
  
  // Update preview when theme changes
  $: if (isOpen && previewElement && (selectedTheme || selectedFormat || customBackgroundColor)) {
    updatePreview();
  }
  
  function resetModalState() {
    selectedFormat = 'png';
    selectedTheme = 'auto';
    customBackgroundColor = '#ffffff';
  }
  
  function getPreviewTheme(selected: string, current: string): string {
    switch (selected) {
      case 'light':
        return 'redux'; // Light theme
      case 'dark':
        return 'redux-dark'; // Dark theme
      case 'custom':
        // For custom, use light theme with custom background
        return 'redux';
      case 'auto':
      default:
        return current; // Use current VS Code theme
    }
  }
  
  function getPreviewBackgroundColor(selected: string, customColor: string, current: string): string {
    switch (selected) {
      case 'light':
        return '#ffffff';
      case 'dark':
        return '#171719';
      case 'custom':
        return customColor;
      case 'auto':
      default:
        return current?.includes('dark') ? '#171719' : '#ffffff';
    }
  }
  
  function isLightBackground(hexColor: string): boolean {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Validate hex color format
    if (hex.length !== 6 || !/^[0-9A-Fa-f]+$/.test(hex)) {
      return true; // Default to light if invalid
    }
    
    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5;
  }
  
  async function updatePreview() {
    if (!previewElement) return;
    
    try {
      // Get the current diagram content from the main diagram
      const mainDiagram = document.querySelector('#mermaid-diagram svg');
      if (mainDiagram) {
        // Clone the SVG and scale it down for preview
        const clonedSvg = mainDiagram.cloneNode(true) as SVGElement;
        
        // Set preview styling
        const backgroundColor = previewBackgroundColor;
        clonedSvg.style.backgroundColor = backgroundColor;
        clonedSvg.style.width = '100%';
        clonedSvg.style.height = '100%';
        clonedSvg.style.maxWidth = '100%';
        clonedSvg.style.maxHeight = '100%';
        clonedSvg.style.objectFit = 'contain';
        
        // Apply theme-specific styling if needed
        const isDarkPreview = previewTheme.includes('dark');
        const isCustomTheme = selectedTheme === 'custom';
        
        if (!isDarkPreview || isCustomTheme) {
          // For light theme or custom theme, ensure good contrast
          const textElements = clonedSvg.querySelectorAll('text, .nodeLabel, tspan');
          textElements.forEach(el => {
            if (el instanceof HTMLElement || el instanceof SVGElement) {
              const currentFill = el.getAttribute('fill') || el.style.fill;
              if (currentFill === 'white' || currentFill === '#ffffff' || currentFill === '#fff') {
                // For custom colors, choose text color based on background brightness
                if (isCustomTheme && customBackgroundColor) {
                  const textColor = isLightBackground(customBackgroundColor) ? '#000000' : '#ffffff';
                  el.setAttribute('fill', textColor);
                  el.style.fill = textColor;
                } else {
                  el.setAttribute('fill', '#000000');
                  el.style.fill = '#000000';
                }
              }
            }
          });
          
          // Update any paths or shapes that might be white
          const shapes = clonedSvg.querySelectorAll('path, rect, circle, ellipse');
          shapes.forEach(el => {
            if (el instanceof SVGElement) {
              const currentFill = el.getAttribute('fill') || el.style.fill;
              const currentStroke = el.getAttribute('stroke') || el.style.stroke;
              
              if (currentFill === 'white' || currentFill === '#ffffff') {
                // Don't change background shapes, only text containers
                if (!el.classList.contains('background') && !el.getAttribute('class')?.includes('background')) {
                  el.setAttribute('fill', '#f9f9f9');
                }
              }
              
              if (currentStroke === 'white' || currentStroke === '#ffffff') {
                el.setAttribute('stroke', '#333333');
              }
            }
          });
        }
        
        // Clear previous content and add new preview
        previewElement.innerHTML = '';
        previewElement.appendChild(clonedSvg);
        previewElement.style.backgroundColor = backgroundColor;
      } else {
        // Fallback if no main diagram found
        previewElement.innerHTML = `<div class="preview-placeholder">
          No diagram available<br/>
          <small>Theme: ${selectedTheme} | Format: ${selectedFormat.toUpperCase()}</small>
        </div>`;
      }
    } catch (error) {
      console.error('Error updating preview:', error);
      previewElement.innerHTML = `<div class="preview-placeholder">
        Preview unavailable<br/>
        <small>Theme: ${selectedTheme} | Format: ${selectedFormat.toUpperCase()}</small>
      </div>`;
    }
  }
  
  function closeModal() {
    isOpen = false;
    dispatch('close');
  }
  
  function handleCancel() {
    closeModal();
  }
  
  function handleExport() {
    const exportTheme = previewTheme;
    const backgroundColor = selectedTheme === 'custom' ? customBackgroundColor : null;
    
    if (selectedFormat === 'png') {
      exportPng(exportTheme, backgroundColor);
    } else {
      exportSvg(exportTheme, backgroundColor);
    }
    
    closeModal();
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  // Update preview when modal opens or theme changes
  $: if (isOpen) {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      updatePreview();
    }, 100);
  }
</script>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }
  
  .modal-content {
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 8px;
    width: 500px;
    max-width: 90vw;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
  }
  
  .modal-header {
    padding: 20px 24px 0;
    border-bottom: none;
    position: relative;
  }
  
  .modal-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--vscode-editor-foreground, #cccccc);
  }
  
  .close-button {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--vscode-editor-foreground, #cccccc);
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  
  .close-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground, #2a2d2e);
  }
  
  .modal-body {
    padding: 24px;
    display: flex;
    gap: 24px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  
  .export-options {
    flex: 1;
  }
  
  .preview-section {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .option-group {
    margin-bottom: 24px;
  }
  
  .option-group-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-editor-foreground, #cccccc);
  }
  
  .format-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .radio-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
    border: 1px solid transparent;
  }
  
  .radio-option:hover {
    background-color: var(--vscode-list-hoverBackground, #2a2d2e);
  }
  
  .radio-option.selected {
    background-color: var(--vscode-list-activeSelectionBackground, #094771);
    border-color: var(--vscode-focusBorder, #007acc);
  }
  
  .radio-input {
    accent-color: var(--vscode-focusBorder, #007acc);
  }
  
  .radio-label {
    color: var(--vscode-editor-foreground, #cccccc);
    font-size: 13px;
  }
  
  .radio-description {
    color: var(--vscode-descriptionForeground, #cccccc99);
    font-size: 12px;
    margin-top: 2px;
  }
  
  .preview-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-editor-foreground, #cccccc);
  }
  
  .preview-container {
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 4px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    background: white;
  }
  
  .preview-placeholder {
    color: var(--vscode-descriptionForeground, #cccccc99);
    font-size: 12px;
    text-align: center;
    position: absolute;
    z-index: 1;
  }
  
  .modal-footer {
    padding: 16px 24px 24px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-editor-background, #1e1e1e);
    flex-shrink: 0;
  }
  
  .button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid;
  }
  
  .button-secondary {
    background: transparent;
    color: var(--vscode-button-secondaryForeground, #cccccc);
    border-color: var(--vscode-button-secondaryBackground, #5a5d5e);
  }
  
  .button-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, #656565);
  }
  
  .button-primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  
  .button-primary:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  
  .background-preview {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
  }
  
  .background-light {
    background: white;
  }
  
  .background-dark {
    background: #171719;
  }
  
  .background-auto {
    background: linear-gradient(45deg, white 50%, #171719 50%);
  }
  
  .custom-color-picker {
    margin-top: 12px;
    margin-left: 32px;
    margin-right: 8px;
    margin-bottom: 8px;
    padding: 12px 16px;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .color-input {
    width: 48px;
    height: 32px;
    border: 2px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 6px;
    cursor: pointer;
    background: none;
    transition: border-color 0.2s ease;
  }
  
  .color-input:hover {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  
  .color-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007acc);
    box-shadow: 0 0 0 2px var(--vscode-focusBorder, #007acc)33;
  }
  
  .color-input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  
  .color-input::-webkit-color-swatch {
    border: none;
    border-radius: 3px;
  }
  
  .color-picker-label {
    display: flex;
    align-items: center;
    margin: 0;
  }
  
  .color-picker-text {
    color: var(--vscode-editor-foreground, #cccccc);
    font-size: 12px;
    font-weight: 500;
    margin-right: 8px;
  }
  
  .color-value {
    color: var(--vscode-descriptionForeground, #cccccc99);
    font-size: 12px;
    font-family: monospace;
    text-transform: uppercase;
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
  }
</style>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown}>
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">Export diagram</h2>
        <button class="close-button" on:click={closeModal} aria-label="Close">
          ✕
        </button>
      </div>
      
      <div class="modal-body">
        <div class="export-options">
          <div class="option-group">
            <h3 class="option-group-title">Export format</h3>
            <div class="format-options">
              <label 
                class="radio-option {selectedFormat === 'png' ? 'selected' : ''}"
                for="format-png"
              >
                <input 
                  type="radio" 
                  id="format-png"
                  class="radio-input"
                  bind:group={selectedFormat} 
                  value="png"
                />
                <div>
                  <div class="radio-label">PNG</div>
                  <div class="radio-description">High quality raster image</div>
                </div>
              </label>
              
              <label 
                class="radio-option {selectedFormat === 'svg' ? 'selected' : ''}"
                for="format-svg"
              >
                <input 
                  type="radio" 
                  id="format-svg"
                  class="radio-input"
                  bind:group={selectedFormat} 
                  value="svg"
                />
                <div>
                  <div class="radio-label">SVG</div>
                  <div class="radio-description">Scalable vector graphics</div>
                </div>
              </label>
            </div>
          </div>
          
          <div class="option-group">
            <h3 class="option-group-title">Background color</h3>
            <div class="theme-options">
              <label 
                class="radio-option {selectedTheme === 'auto' ? 'selected' : ''}"
                for="theme-auto"
              >
                <input 
                  type="radio" 
                  id="theme-auto"
                  class="radio-input"
                  bind:group={selectedTheme} 
                  value="auto"
                />
                <div>
                  <div class="radio-label">Auto</div>
                  <div class="radio-description">Follow VS Code theme</div>
                </div>
                <div class="background-preview background-auto"></div>
              </label>
              
              <label 
                class="radio-option {selectedTheme === 'light' ? 'selected' : ''}"
                for="theme-light"
              >
                <input 
                  type="radio" 
                  id="theme-light"
                  class="radio-input"
                  bind:group={selectedTheme} 
                  value="light"
                />
                <div>
                  <div class="radio-label">Light</div>
                  <div class="radio-description">Black text on white background</div>
                </div>
                <div class="background-preview background-light"></div>
              </label>
              
              <label 
                class="radio-option {selectedTheme === 'dark' ? 'selected' : ''}"
                for="theme-dark"
              >
                <input 
                  type="radio" 
                  id="theme-dark"
                  class="radio-input"
                  bind:group={selectedTheme} 
                  value="dark"
                />
                <div>
                  <div class="radio-label">Dark</div>
                  <div class="radio-description">Light text on dark background</div>
                </div>
                <div class="background-preview background-dark"></div>
              </label>
              
              <label 
                class="radio-option {selectedTheme === 'custom' ? 'selected' : ''}"
                for="theme-custom"
              >
                <input 
                  type="radio" 
                  id="theme-custom"
                  class="radio-input"
                  bind:group={selectedTheme} 
                  value="custom"
                />
                <div>
                  <div class="radio-label">Custom</div>
                  <div class="radio-description">Choose your own background color</div>
                </div>
                <div class="background-preview" style="background-color: {customBackgroundColor}"></div>
              </label>
              
              {#if selectedTheme === 'custom'}
                <div class="custom-color-picker">
                  <label for="custom-color" class="color-picker-label">
                    <span class="color-picker-text">Background color:</span>
                  </label>
                  <input 
                    type="color" 
                    id="custom-color"
                    bind:value={customBackgroundColor}
                    class="color-input"
                    title="Pick background color"
                    aria-label="Custom background color picker"
                  />
                  <span class="color-value">{customBackgroundColor}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
        
        <div class="preview-section">
          <h3 class="preview-title">Preview</h3>
          <div 
            class="preview-container"
            bind:this={previewElement}
            style="background-color: {previewBackgroundColor}"
          >
            <div class="preview-placeholder">
              Loading preview...
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="button button-secondary" on:click={handleCancel}>
          Cancel
        </button>
        <button class="button button-primary" on:click={handleExport}>
          Export
        </button>
      </div>
    </div>
  </div>
{/if}
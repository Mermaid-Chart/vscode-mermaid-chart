<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { exportPng, exportSvg, getBase64SVG } from './services/exportService';
  import { vscode } from './utility/vscode';
  import ColorPickerIcon from './ColorPickerIcon.svelte';
  import CopyIcon from './CopyIcon.svelte';
  import TickIcon from './TickIcon.svelte';
  
  export let isOpen = false;
  export let currentTheme: string;

  
  const dispatch = createEventDispatcher();
  
  // Simple theme detection based on diagram theme (like other components)
  $: isDiagramDark = currentTheme?.includes('dark') || currentTheme === 'dark';
  
  // Modal theme follows diagram theme
  $: modalTheme = isDiagramDark ? 'dark' : 'light';
  
  let selectedFormat: 'png' | 'svg' = 'png';
  let selectedTheme: 'light' | 'dark' | 'custom' | 'transparent' = currentTheme?.includes('dark') ? 'dark' : 'light';
  let customBackgroundColor: string = '#ffffff';
  let previewElement: HTMLElement;
  let previewContentElement: HTMLElement | undefined; // Inner div that gets cleared - keeps copy button intact
  let copySuccess = false;
  let copyTimeout: NodeJS.Timeout;
  
  // Preview diagram based on selected theme
  $: previewTheme = getPreviewTheme(selectedTheme, currentTheme);
  $: previewBackgroundColor = getPreviewBackgroundColor(selectedTheme, customBackgroundColor, currentTheme);
  // Export uses original colors, preview uses modal-matching colors for better visual consistency
  $: exportBackgroundColor = getExportBackgroundColor(selectedTheme, customBackgroundColor, currentTheme);
  
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
    selectedTheme = currentTheme?.includes('dark') ? 'dark' : 'light';
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
      case 'transparent':
      default:
        return current; // Use current VS Code theme
    }
  }
  
  function getPreviewBackgroundColor(selected: string, customColor: string, current: string): string {
    switch (selected) {
      case 'light':
        return '#ffffff';
      case 'dark':
        // Use modal background color for better visual consistency in preview
        return isDiagramDark ? '#1f1f1f' : '#171719';
      case 'custom':
        return customColor;
      case 'transparent':
      default:
        return 'transparent';
    }
  }
  
  function getExportBackgroundColor(selected: string, customColor: string, current: string): string {
    switch (selected) {
      case 'light':
        return '#ffffff';
      case 'dark':
        // Use original diagram background color for export
        return '#171719';
      case 'custom':
        return customColor;
      case 'transparent':
      default:
        return 'transparent';
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
    const contentEl = previewContentElement ?? previewElement?.querySelector('.preview-content');
    if (!contentEl) return;
    
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
        
        // Clear only the preview content area (keeps copy button intact)
        contentEl.innerHTML = '';
        contentEl.appendChild(clonedSvg);
        if (previewElement) {
          previewElement.style.backgroundColor = backgroundColor;
        }
      } else {
        // Fallback if no main diagram found
        contentEl.innerHTML = `<div class="preview-placeholder">
          No diagram available<br/>
          <small>Theme: ${selectedTheme} | Format: ${selectedFormat.toUpperCase()}</small>
        </div>`;
      }
    } catch (error) {
      console.error('Error updating preview:', error);
      contentEl.innerHTML = `<div class="preview-placeholder">
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
    const backgroundColor = selectedTheme === 'custom' ? customBackgroundColor : 
                           selectedTheme === 'transparent' ? 'transparent' : 
                           exportBackgroundColor; // Use original export colors, not preview colors
    
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
  $: if (isOpen && (previewContentElement || previewElement)) {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      updatePreview();
    }, 100);
  }

  async function copyToClipboard() {
    try {
      if (selectedFormat === 'png') {
        await copyPngToClipboard();
      } else {
        await copySvgToClipboard();
      }
      
      // Show success state
      copySuccess = true;
      
      // Clear previous timeout
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }
      
      // Reset after 2 seconds
      copyTimeout = setTimeout(() => {
        copySuccess = false;
      }, 2000);
      
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not supported in this environment')) {
        vscode.postMessage({ type: 'showWarning', message: msg });
      }
    }
  }

  async function copyPngToClipboard(): Promise<void> {
    // Use main diagram (same as Export) so we get correct dimensions and getBase64SVG (fonts, etc.)
    const svgEl = document.querySelector<HTMLElement>('#mermaid-diagram svg');
    if (!svgEl) return;
    
    const rect = svgEl.getBoundingClientRect();
    const w = Math.max(Math.round(rect.width), 1);
    const h = Math.max(Math.round(rect.height), 1);
    const scale = 2;
    const width = w * scale;
    const height = h * scale;
    
    const backgroundColor = selectedTheme === 'custom'
      ? customBackgroundColor
      : selectedTheme === 'transparent'
        ? 'transparent'
        : exportBackgroundColor;
    
    const base64 = await getBase64SVG(svgEl, width, height);
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    const img = new Image();
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG as image'));
      img.src = dataUrl;
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (backgroundColor && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (err) {
      // Webview may not allow writing images to clipboard (e.g. VS Code security)
      console.warn('Clipboard write image failed:', err);
      throw new Error('Copying image to clipboard is not supported in this environment. Use Export to save as PNG.');
    }
  }

  async function copySvgToClipboard() {
    if (!previewElement) return;
    
    const svgElement = previewElement.querySelector('svg');
    if (svgElement) {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      await navigator.clipboard.writeText(svgString);
    }
  }
</script>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }
  
  .modal-content {
    background: var(--modal-bg);
    border: 1px solid var(--modal-border);
    border-radius: 6px;
    width: 520px;
    max-width: 90vw;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
  }
  
  .modal-content.dark {
    --modal-bg: #1f1f1f;
    --modal-border: #454545;
    --text-primary: #cccccc;
    --text-secondary: #9d9d9d;
    --section-border: #3e3e42;
    --selected-bg: #04395e;
    --input-bg: #2b2b2b;
    --hover-bg: #2b2b2b;
    --input-border: #464647;
    --button-primary-bg: #0e639c;
    --button-primary-hover: #1177bb;
    --button-secondary-bg: #313131;
    --button-secondary-border: #404040;
    --button-secondary-hover: #313131;
    --copy-button-bg: #2A2D2E;
    --copy-button-bg-hover: #333638;
  }
  
  .modal-content.light {
    --modal-bg: #ffffff;
    --modal-border: #c8c8c8;
    --text-primary: #3b3b3b;
    --text-secondary: #3b3b3b;
    --section-border: #d4d4d4;
    --selected-bg: #0060C0;
    --input-bg: #e8e8e8; 
    --hover-bg: #e8e8e8; 
    --input-border: #d4d4d4;
    --button-primary-bg: #0060C0;
    --button-primary-hover: #0060C0;
    --button-secondary-bg: #E4E4E4;
    --button-secondary-border: #d4d4d4;
    --button-secondary-hover: #e8e8e8;
    --copy-button-bg: #E4E4E4;
    --copy-button-bg-hover: #EBEBEB;
  }
  
  .modal-header {
    padding: 12px 12px 0px 12px;
    position: relative;
    background: var(--modal-bg);
  }
  
  .modal-title {
    font-size: 16px;
    font-weight: 400;
    margin: 0;
    color: var(--text-primary);
  }
  
  .close-button {
    position: absolute;
    top: 8px;
    right: 6px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--text-primary);
    padding: 6px;
    border-radius: 3px;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }
  
  .close-button:hover {
    background-color: var(--hover-bg);
  }
  
  .modal-body {
    padding: 12px;
    display: flex;
    gap: 20px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  
  .export-options {
    flex: 1;
    min-width: 0;
  }
  
  .preview-section {
    flex: 1.5;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .option-group {
    margin-bottom: 20px;
  }
  
  .option-group-title {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: 0.5px;
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
    align-items: flex-start;
    background-color: var(--input-bg);
    gap: 10px;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    border: 1px solid transparent;
    margin-bottom: 4px;
  }
  
  .radio-option:hover {
    background-color: var(--hover-bg);
  }
  
  .radio-option.selected {
    background-color: var(--selected-bg);
    color: #ffffff;
  }
  
  .radio-input {
    appearance: none;
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border: 1.5px solid #CCCCCC;
    border-radius: 50%;
    margin-top: 2px;
    position: relative;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }
  
  .radio-input:checked {
    /* Checked state handled by ::after pseudo-element */
  }
  
  .radio-input:checked::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background-color: #ffffff;
    border-radius: 50%;
    display: block;
  }
  
  .radio-content {
    flex: 1;
  }
  
  .radio-label {
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 2px;
    display: block;
  }
  
  .radio-description {
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.3;
  }
  
  .radio-option.selected .radio-description {
    color: #ffffff;
  }

  .radio-option.selected .radio-label {
    color: #ffffff;
  }
  
  .preview-title {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: 0.5px;
  }
  
  .preview-container {
    border: 1px solid var(--section-border);
    border-radius: 4px;
    height: 180px;  
    min-height: 250px;
    max-height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    background: white;
    flex-shrink: 0;
  }
  
  .preview-container.transparent-bg {
    background: 
      linear-gradient(45deg, #f0f0f0 25%, transparent 25%), 
      linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), 
      linear-gradient(45deg, transparent 75%, #f0f0f0 75%), 
      linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
    background-size: 12px 12px;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
    background-color: #ffffff;
  }

  .preview-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  
  .preview-placeholder {
    color: var(--text-secondary);
    font-size: 11px;
    text-align: center;
    position: absolute;
    z-index: 1;
  }
  
  .modal-footer {
    padding: 0px 12px 12px 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: var(--modal-bg);
    flex-shrink: 0;
  }
  
  .button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .button-secondary {
    background: var(--button-secondary-bg);
    border: 1px solid var(--button-secondary-border);
    color: var(--text-primary);
  }
  
  .button-secondary:hover {
    background-color: var(--button-secondary-hover);
  }
  
  .button-primary {
    background: var(--button-primary-bg);
    border: 1px solid var(--button-primary-bg);
    color: #ffffff;
  }
  
  .button-primary:hover {
    background: var(--button-primary-hover);
    border-color: var(--button-primary-hover);
  }
  
  .background-preview {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid var(--section-border);
  }
  
  .background-light {
    background: #ffffff;
    border: 1px solid #d4d4d4;
  }
  
  .background-dark {
    background: #1a1a1a;
    border: 1px solid #3e3e42;
  }
  
  .background-transparent {
    background: 
      linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
      linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
      linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
    background-color: #ffffff;
    border: 1px solid #d4d4d4;
  }
  
  .background-custom {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--section-border);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .background-custom:hover {
    border-color: var(--selected-bg);
  }
  
  .background-color-options {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
  }
  
  .color-option {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .color-option.selected {
    box-shadow: 0 0 0 2px var(--selected-bg);
  }
  
  .color-option:hover {
    transform: scale(1.05);
  }
  
  .custom-color-picker {
    margin: 12px 0;
    padding: 12px 16px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    overflow: hidden;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  .color-picker-container {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  
  .color-input {
    width: 32px;
    height: 24px;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    cursor: pointer;
    background: none;
    transition: border-color 0.2s ease;
  }
  
  .color-input:hover {
    border-color: var(--selected-bg);
  }
  
  .color-input:focus {
    outline: none;
    border-color: var(--selected-bg);
    box-shadow: 0 0 0 1px var(--selected-bg);
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
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .color-value {
    color: var(--text-secondary);
    font-size: 11px;
    font-family: monospace;
    text-transform: uppercase;
    background: var(--input-bg);
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid var(--input-border);
    min-width: 55px;
    max-width: 55px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .copy-button {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--copy-button-bg);
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    z-index: 100;
    opacity: 1;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .copy-button:hover {
    background: var(--copy-button-bg-hover);
    transform: scale(1.05);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  }

  .copy-button:active {
    transform: scale(0.95);
  }

  .modal-content.dark .copy-button {
    border-color: rgba(255, 255, 255, 0.1);
  }
</style>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown}>
    <div class="modal-content {modalTheme}">
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
                <div class="radio-content">
                  <span class="radio-label">PNG</span>
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
                <div class="radio-content">
                  <span class="radio-label">SVG</span>
                  <div class="radio-description">Scalable vector graphics</div>
                </div>
              </label>
            </div>
          </div>
          
          <div class="option-group">
            <h3 class="option-group-title">Background color</h3>
            <div class="background-color-options">
              <div 
                class="color-option background-light {selectedTheme === 'light' ? 'selected' : ''}"
                on:click={() => selectedTheme = 'light'}
                title="Light background"
              ></div>
              
              <div 
                class="color-option background-dark {selectedTheme === 'dark' ? 'selected' : ''}"
                on:click={() => selectedTheme = 'dark'}
                title="Dark background"
              ></div>
              
              <div 
                class="color-option background-transparent {selectedTheme === 'transparent' ? 'selected' : ''}"
                on:click={() => selectedTheme = 'transparent'}
                title="Transparent background"
              ></div>
              
              <div 
                class="color-option background-custom {selectedTheme === 'custom' ? 'selected' : ''}"
                style="position: relative;"
                title="Custom color"
              >
                <!-- Color input positioned over the entire area -->
                <input 
                  type="color" 
                  bind:value={customBackgroundColor}
                  on:input={() => selectedTheme = 'custom'}
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: none;"
                  title="Pick custom color"
                />
                <!-- Icon always visible, never changes -->
                <ColorPickerIcon fill={modalTheme === 'dark' ? '#cccccc' : '#333333'} />
              </div>
            </div>
          </div>
        </div>
        
        <div class="preview-section">
          <h3 class="preview-title">Preview</h3>
          <div 
            class="preview-container {selectedTheme === 'transparent' ? 'transparent-bg' : ''}"
            bind:this={previewElement}
            style="background-color: {selectedTheme === 'transparent' ? 'transparent' : previewBackgroundColor}"
          >
            <!-- Inner content only - cleared by updatePreview; copy button stays outside so it is not removed -->
            <div class="preview-content" bind:this={previewContentElement}>
              <div class="preview-placeholder">
                Loading preview...
              </div>
            </div>
            <!-- Copy button (sibling of preview-content so it is never cleared) -->
            <button 
              class="copy-button" 
              on:click={copyToClipboard}
              title="Copy to clipboard"
              aria-label="Copy {selectedFormat === 'png' ? 'image' : 'SVG code'} to clipboard"
            >
              {#if copySuccess}
                <TickIcon fill={modalTheme === 'dark' ? '#cccccc' : '#666666'} />
              {:else}
                <CopyIcon fill={modalTheme === 'dark' ? '#cccccc' : '#666666'} />
              {/if}
            </button>
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
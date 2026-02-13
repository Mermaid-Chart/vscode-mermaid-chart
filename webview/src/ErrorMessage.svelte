<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let errorMessage: string;
    export let isRepairing: boolean = false;
    export let aiCredits: { remaining: number; total: number } | null = null;
    
    // Debug logging
    $: if (aiCredits) {
        console.log('ErrorMessage aiCredits:', aiCredits);
    }
    
    const dispatch = createEventDispatcher();
    
    function handleRepair() {
      dispatch('repair');
    }
  </script>
  
  <style>
    #error-message {
        position: fixed;
        z-index: 1000;
        background-color: #2b1c1c;
        padding: 16px;
        font-size: 14px;
        text-align: left;
        display: none;
        user-select:text;
        max-width: 90vw;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    #error-message.errorVisible {
        display: block;
    }
    
    .error-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .credits-bottom {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      font-size: 13px;
      color: #ffffff;
      background: #424242;
      padding: 12px 0;
      text-align: center;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .error-text {
      margin: 0;
      padding: 0;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.4;
    }
    
    .repair-section {
      display: flex;
      justify-content: flex-start;
      align-items: center;
    }
    
    .repair-button-container {
      display: flex;
      align-items: center;
    }
    
    .repair-button {
      background-color: #3360c0;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(51, 96, 192, 0.2);
    }
    
    .repair-button:hover:not(:disabled) {
      background-color: #2a4f9e;
      box-shadow: 0 3px 6px rgba(51, 96, 192, 0.3);
      transform: translateY(-1px);
    }
    
    .repair-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: 0 2px 4px rgba(51, 96, 192, 0.1);
    }
    
    .repair-icon {
      font-size: 16px;
    }

    .ai-badge {
      background-color: rgba(255, 255, 255, 0.2);
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }

    @media (max-width: 480px) {
      .repair-section {
        flex-direction: column;
        align-items: stretch;
      }
      
      .credits-container {
        justify-content: center;
      }
    }
  </style>
  <div id="error-message" class:errorVisible={!!errorMessage}>
    {#if errorMessage}
      <div class="error-content">
        <!-- Error message -->
        <pre class="error-text">{errorMessage}</pre>
        
        <!-- Repair button -->
        <div class="repair-section">
          <div class="repair-button-container">
            <button 
              class="repair-button" 
              on:click={handleRepair}
              disabled={isRepairing}
            >
              {isRepairing ? 'Repairing...' : 'Repair diagram with'}
              <span class="ai-badge">AI</span>
            </button>
          </div>
        </div>
        
        <!-- Credits at bottom of error container -->
        {#if aiCredits}
          <div class="credits-bottom">
            {aiCredits.remaining} credits remaining out of {aiCredits.total}
          </div>
        {/if}
      </div>
    {/if}
  </div>

<script>
    import { createEventDispatcher } from 'svelte';
    
    export let errorMessage;
    export let isRepairing = false;
    
    const dispatch = createEventDispatcher();
    
    function handleRepair() {
      dispatch('repair');
    }
  </script>
  
  <style>
    #error-message {
        position: fixed;
        z-index: 1000;
        background-color: #ffdddd;
        color: #d8000c;
        padding: 10px;
        font-size: 14px;
        text-align: left;
        border: 1px solid #d8000c;
        display: none;
        user-select:text;
    }

    #error-message.errorVisible {
        display: block;
    }
    
    .error-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .repair-button {
      background-color: #2329D6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background-color 0.2s;
      align-self: flex-start;
    }
    
    .repair-button:hover:not(:disabled) {
      background-color: #1a1fa8;
    }
    
    .repair-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .repair-icon {
      font-size: 16px;
    }
  </style>
  <div id="error-message" class:errorVisible={!!errorMessage}>
    {#if errorMessage}
      <div class="error-content">
        <pre>{errorMessage}</pre>
        <button 
          class="repair-button" 
          on:click={handleRepair}
          disabled={isRepairing}
        >
          <span class="repair-icon">✨</span>
          {isRepairing ? 'Repairing...' : 'Repair diagram with AI'}
        </button>
      </div>
    {/if}
  </div>

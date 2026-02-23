<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { vscode } from './utility/vscode';
    
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
    
    function handleUpgrade() {
      // Send message to extension to open billing page
      vscode.postMessage({
        type: "openUrl",
        url: "https://mermaid.ai/app/user/billing"
      });
    }
  </script>
  
  <style>
    #error-message {
        position: fixed;
        z-index: 1000;
        display: none;
        user-select: text;
        width: 100vw;
        left: 0;
        top: 0;
        word-wrap: break-word;
        overflow-wrap: break-word;
        flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
    }

    #error-message.errorVisible {
        display: flex;
    }
    
    .error-message-container {
      background-color: #3E1A1A;
      padding: 16px;
      text-align: left;
      overflow: hidden;
    }
    
    .error-header {
      margin-bottom: 8px;
    }
    
    .error-icon {
          display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 7px;
    }
    
    .error-title {
      font-size: 16px;
      font-weight: 600;
      font-weight: 400;
      color: #ffffff;
      margin: 0;
      line-height: 1.2;
    }
    
    .credits-bottom {
      background: #321515;
      width: 100%;
      min-height: 34px;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #ffffff;
      font-weight: 400;
      box-sizing: border-box;
    }
    
    .credits-text {
      color: #ffffff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      flex-shrink: 0;
      font-weight: 400;
    }
    
    .error-details {
      font-size: 11px;
      line-height: 1.4;
      padding: 0px 0px 0px 30px;
      color: #ffffff;
      word-break: break-word;
      overflow-wrap: break-word;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    
    .repair-button {
      background-color: #0060C0;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 10px 12px;
      width: 171  px;
      height: 34px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
    }
    
    .repair-button:hover:not(:disabled) {
      background-color: #0056B0;
    }
    
    .repair-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 480px) {
      .error-message-container {
        padding: 12px;
      }
      
      .credits-bottom {
        flex-direction: column;
        gap: 8px;
        justify-content: space-between;
        padding: 14px 10px 10px 10px;
      }
      
      .repair-button {
        width: 100%;
      }
    }
  </style>
  <div id="error-message" class:errorVisible={!!errorMessage}>
    {#if errorMessage}
      <!-- Error message container -->
      <div class="error-message-container">
        <div class="error-header">
          <div class="error-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <mask id="mask0_721_342" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <rect width="24" height="24" fill="#D9D9D9"/>
              </mask>
              <g mask="url(#mask0_721_342)">
                <path d="M12 16.7308C12.2288 16.7308 12.4207 16.6533 12.5755 16.4985C12.7303 16.3437 12.8077 16.1518 12.8077 15.923C12.8077 15.6942 12.7303 15.5023 12.5755 15.3475C12.4207 15.1928 12.2288 15.1155 12 15.1155C11.7712 15.1155 11.5793 15.1928 11.4245 15.3475C11.2697 15.5023 11.1923 15.6942 11.1923 15.923C11.1923 16.1518 11.2697 16.3437 11.4245 16.4985C11.5793 16.6533 11.7712 16.7308 12 16.7308ZM11.25 13.077H12.75V7.077H11.25V13.077ZM12.0017 21.5C10.6877 21.5 9.45267 21.2507 8.2965 20.752C7.14033 20.2533 6.13467 19.5766 5.2795 18.7218C4.42433 17.8669 3.74725 16.8617 3.24825 15.706C2.74942 14.5503 2.5 13.3156 2.5 12.0017C2.5 10.6877 2.74933 9.45267 3.248 8.2965C3.74667 7.14033 4.42342 6.13467 5.27825 5.2795C6.13308 4.42433 7.13833 3.74725 8.294 3.24825C9.44967 2.74942 10.6844 2.5 11.9983 2.5C13.3123 2.5 14.5473 2.74933 15.7035 3.248C16.8597 3.74667 17.8653 4.42342 18.7205 5.27825C19.5757 6.13308 20.2528 7.13833 20.7518 8.294C21.2506 9.44967 21.5 10.6844 21.5 11.9983C21.5 13.3123 21.2507 14.5473 20.752 15.7035C20.2533 16.8597 19.5766 17.8653 18.7218 18.7205C17.8669 19.5757 16.8617 20.2528 15.706 20.7518C14.5503 21.2506 13.3156 21.5 12.0017 21.5ZM12 20C14.2333 20 16.125 19.225 17.675 17.675C19.225 16.125 20 14.2333 20 12C20 9.76667 19.225 7.875 17.675 6.325C16.125 4.775 14.2333 4 12 4C9.76667 4 7.875 4.775 6.325 6.325C4.775 7.875 4 9.76667 4 12C4 14.2333 4.775 16.125 6.325 17.675C7.875 19.225 9.76667 20 12 20Z" fill="#FF0000"/>
              </g>
            </svg>
            <p class="error-title">A syntax error was detected on line 3.</p>
          </div>
          <div>
            <p class="error-details">{errorMessage.replace(/^A syntax error was detected on line \d+\.\s*/, '').trim()}</p>
          </div>
        </div>
      </div>
      
      <!-- Credits and repair button container -->
      {#if aiCredits}
        <div class="credits-bottom">
          <span class="credits-text">Credits left: {aiCredits.remaining}</span>
          {#if aiCredits.remaining === 0}
            <button 
              class="repair-button" 
              on:click={handleUpgrade}
            >
              Upgrade plan
            </button>
          {:else}
            <button 
              class="repair-button" 
              on:click={handleRepair}
              disabled={isRepairing}
            >
              {isRepairing ? 'Repairing...' : 'Repair diagram with AI'}
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

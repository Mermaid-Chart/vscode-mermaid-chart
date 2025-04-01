<script>
  import { vscode } from "./utility/vscode";

    export let errorMessage;
    const fixWithAI = () => {
        vscode.postMessage({ type: 'fixWithAI' });
    };
</script>

<style>
    #error-message {
        position: fixed;
        z-index: 1000;
        background-color: #ffdddd;
        color: #d8000c;
        padding: 10px;
        font-size: 14px;
        text-align: center;
        border: 1px solid #d8000c;
        display: none;
    }

    #error-message.errorVisible {
        display: block;
    }

    .fix-button {
        margin-top: 10px;
        padding: 5px 10px;
        background-color: #007acc;
        color: white;
        border: none;
        cursor: pointer;
        border-radius: 3px;
    }

    .fix-button:hover {
        background-color: #005a9e;
    }
</style>

<div id="error-message" class:errorVisible={!!errorMessage}>
    {#if errorMessage}
        <p>{errorMessage}</p>
        <button class="fix-button" on:click={fixWithAI}>Fix with Mermaid AI</button>
    {/if}
</div>
<script lang="ts">
    export let stroke: string = "currentColor"; // Default to current text color
  </script>
  
  <style>
    svg {
      width: 25px;
      height: 25px;
      transition: stroke 0.3s, fill 0.3s;
    }
  </style>
  
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke={stroke}
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
<script lang="ts">
  export let fill: string;
</script>
<style>
  svg {
    width: 25px;
    height: 25px;
    transition: stroke 0.3s, fill 0.3s; 
  }
</style>
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 16L12 8" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M9 13L12 16L15 13" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

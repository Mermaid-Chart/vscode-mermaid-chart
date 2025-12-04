/// <reference types="svelte" />
/// <reference types="vite/client" />

// Type declarations for unplugin-icons
declare module '~icons/*' {
  import { SvelteComponent } from 'svelte';
  export default class extends SvelteComponent<{
    color?: string;
    size?: string | number;
  }> {}
}

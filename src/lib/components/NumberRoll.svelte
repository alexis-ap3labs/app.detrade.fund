<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  // Component props with defaults
  export let value: string | number = "0";
  export let duration = 1000; // Animation duration in milliseconds
  export let format: (n: number) => string = (n) => n.toFixed(2); // Number formatting function
  export let prefix = ""; // Text to display before the number
  export let suffix = ""; // Text to display after the number

  // Animated number store with smooth easing transition
  const number = tweened(0, {
    duration,
    easing: cubicOut
  });

  // Helper function to safely parse string or number input
  function parseValue(val: string | number): number {
    return typeof val === 'string' ? parseFloat(val) : val;
  }

  // Reactive statement to update animated value when prop changes
  $: if (!isNaN(parseValue(value))) {
    number.set(parseValue(value));
  }
</script>

<!-- Display animated number with prefix/suffix or fallback to original value -->
{#if !isNaN(parseValue(value))}
  {prefix}{format($number)}{suffix}
{:else}
  {value}
{/if}

<style>
  /* Monospace font for consistent number width during animation */
  .number-roll {
    display: inline-block;
    font-variant-numeric: tabular-nums;
  }
</style> 
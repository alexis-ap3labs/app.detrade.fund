<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  export let value: string | number = "0";
  export let duration = 1000;
  export let format: (n: number) => string = (n) => n.toFixed(2);
  export let prefix = "";
  export let suffix = "";

  const number = tweened(0, {
    duration,
    easing: cubicOut
  });

  function parseValue(val: string | number): number {
    return typeof val === 'string' ? parseFloat(val) : val;
  }

  $: if (!isNaN(parseValue(value))) {
    number.set(parseValue(value));
  }
</script>

{#if !isNaN(parseValue(value))}
  {prefix}{format($number)}{suffix}
{:else}
  {value}
{/if}

<style>
  .number-roll {
    display: inline-block;
    font-variant-numeric: tabular-nums;
  }
</style> 
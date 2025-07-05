<script lang="ts">
  // Configurable spinner size prop with default value
  export let size = '40px';
</script>

<div class="spinner-container">
  <div class="spinner" style="width: {size}; height: {size};" />
</div>

<style>
  /* Flexbox container for centering the spinner */
  .spinner-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  /* Animated loading spinner with customizable size */
  .spinner {
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Continuous rotation animation */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style> 
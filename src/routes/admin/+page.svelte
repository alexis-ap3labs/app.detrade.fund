<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import { wallet, address } from '$lib/stores/wallet';
  import { logger, LogContext } from '$lib/utils/logger';
  import { providers, utils } from 'ethers';
  
  const ADMIN_ADDRESS = '0x5904BfE5D9d96b57c98AaA935337e7Aa228ed528';
  const SIGN_MESSAGE = 'Sign this message to access DeTrade admin panel';
  
  let isAuthenticated = false;
  let errorMessage = '';
  let isProcessing = false;
  let numericValue = '';
  let isSubmitting = false;
  let submitError = '';
  let submitSuccess = '';
  let grossAprValue = '';
  let netAprValue = '';

  async function verifySignature(signature: string, message: string, expectedAddress: string): Promise<boolean> {
    try {
      const recoveredAddress = utils.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      logger.error('Signature verification failed', {
        context: LogContext.WALLET,
        data: { error: String(error) }
      });
      return false;
    }
  }

  async function handleAuthentication() {
    if (!$wallet || !$address) {
      errorMessage = 'Please connect your wallet first';
      return;
    }

    const currentAddress = $address;
    if (!currentAddress || currentAddress.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
      errorMessage = 'This wallet is not authorized to access admin panel';
      return;
    }

    try {
      isProcessing = true;
      errorMessage = '';

      if (!window.ethereum) {
        throw new Error('No ethereum provider found');
      }

      const provider = new providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const signature = await signer.signMessage(SIGN_MESSAGE);
      
      const isValid = await verifySignature(signature, SIGN_MESSAGE, ADMIN_ADDRESS);

      if (isValid) {
        isAuthenticated = true;
        errorMessage = '';
      } else {
        errorMessage = 'Signature verification failed';
      }
    } catch (error) {
      logger.error('Authentication error', {
        context: LogContext.WALLET,
        data: { error: String(error) }
      });
      errorMessage = 'Failed to sign message';
    } finally {
      isProcessing = false;
    }
  }

  function validateAprFormat(value: string): boolean {
    // Vérifie le format X.XX ou XX.XX au moment de la validation
    const regex = /^\d+\.\d{2}$/;
    return regex.test(value);
  }

  async function handleSubmit() {
    // Validation du format avant la conversion
    if (!validateAprFormat(grossAprValue) || !validateAprFormat(netAprValue)) {
      submitError = 'APR values must have exactly two decimal places (e.g. 10.00 or 8.50)';
      return;
    }

    const grossApr = parseFloat(grossAprValue);
    const netApr = parseFloat(netAprValue);
    
    if (isNaN(grossApr) || isNaN(netApr)) {
      return;
    }

    try {
      isSubmitting = true;
      submitError = '';
      submitSuccess = '';
      
      const response = await fetch('/api/underlying-apr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ grossApr, netApr })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save APR values');
      }

      logger.info('APR values saved successfully', {
        context: LogContext.UI,
        data: { grossApr, netApr }
      });

      submitSuccess = `APR values successfully saved to MongoDB`;
      grossAprValue = '';
      netAprValue = '';
      
    } catch (error) {
      logger.error('Failed to save APR values', {
        context: LogContext.UI,
        data: { error: String(error) }
      });
      submitError = 'Failed to save APR values';
    } finally {
      isSubmitting = false;
    }
  }

  // Simplification de la fonction handleInput pour permettre la saisie libre
  function handleInput(event: Event, type: 'gross' | 'net') {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^\d.]/g, ''); // Garde uniquement les chiffres et le point

    if (type === 'gross') {
      grossAprValue = value;
    } else {
      netAprValue = value;
    }
  }
</script>

<svelte:head>
  <title>DeTrade - Administration</title>
  <meta property="og:title" content="DeTrade - Administration" />
  <meta property="og:description" content="Administration panel" />
  <meta property="og:image" content="https://app.detrade.fund/detrade-logo-text.webp" />
  <meta property="og:url" content="https://detrade.fund/admin" />
  <meta property="og:type" content="website" />
</svelte:head>

<main>
  <Header />
  <div class="background-logo"></div>
  <div class="background-wrapper">
    <div class="content">
      {#if !isAuthenticated}
        <div class="auth-container">
          <h2>Admin Authentication</h2>
          <div class="auth-content">
            <p class="instruction">Please sign a message with the authorized wallet to access the admin panel</p>
            {#if !$wallet}
              <p class="wallet-status">Wallet not connected</p>
            {:else if !$address || $address.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()}
              <p class="wallet-status error">Connected wallet is not authorized</p>
            {:else}
              <p class="wallet-status success">Authorized wallet connected</p>
            {/if}
            <button 
              class="auth-button" 
              on:click={handleAuthentication}
              disabled={isProcessing || !$wallet || !$address || $address.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()}
            >
              {#if isProcessing}
                Verifying...
              {:else}
                Sign to Authenticate
              {/if}
            </button>
            {#if errorMessage}
              <p class="error-message">{errorMessage}</p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="admin-content">
          <div class="admin-menu">
            <div class="form-container">
              <h2>Projected APR</h2>
              <form on:submit|preventDefault={handleSubmit} class="value-form">
                <div class="input-group">
                  <label for="grossApr">Enter Gross APR value (%):</label>
                  <input
                    type="text"
                    id="grossApr"
                    bind:value={grossAprValue}
                    on:input={(e) => handleInput(e, 'gross')}
                    placeholder="e.g. 10.00"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div class="input-group">
                  <label for="netApr">Enter Net APR value (%):</label>
                  <input
                    type="text"
                    id="netApr"
                    bind:value={netAprValue}
                    on:input={(e) => handleInput(e, 'net')}
                    placeholder="e.g. 8.50"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                {#if submitError}
                  <p class="error-message">{submitError}</p>
                {/if}
                {#if submitSuccess}
                  <p class="success-message">{submitSuccess}</p>
                {/if}
                <button 
                  type="submit" 
                  class="submit-button"
                  disabled={isSubmitting || !validateAprFormat(grossAprValue) || !validateAprFormat(netAprValue)}
                >
                  {#if isSubmitting}
                    Saving...
                  {:else}
                    Validate
                  {/if}
                </button>
              </form>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
  <Footer />
</main>

<style>
  main {
    min-height: 100vh;
    background: linear-gradient(135deg, #003366 0%, #001830 85%, #000c1a 100%);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .background-logo {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 120vh;
    height: 120vh;
    background-image: url('/logo-detrade.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    opacity: 0.01;
    pointer-events: none;
    z-index: 0;
  }

  .background-wrapper {
    position: relative;
  }

  .background-wrapper::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.115) 0%, transparent 54%);
    pointer-events: none;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0% {
      background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.11) 0%, transparent 53.5%);
    }
    25% {
      background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.115) 0%, transparent 54%);
    }
    50% {
      background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.12) 0%, transparent 54.5%);
    }
    75% {
      background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.115) 0%, transparent 54%);
    }
    100% {
      background: radial-gradient(circle at 50% 50%, rgba(77, 168, 255, 0.11) 0%, transparent 53.5%);
    }
  }

  .content {
    position: relative;
    margin: 0 auto;
    max-width: 1200px;
    padding-inline: 2rem;
    z-index: 1;
    height: 100vh;
  }

  .content h1 {
    color: white;
    font-size: 2.5rem;
    margin-bottom: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    font-weight: 700;
    letter-spacing: 0;
  }

  .content h1::after,
  .content h1::before {
    content: none;
    display: none;
    background: none;
    border: none;
    height: 0;
    width: 0;
  }

  .admin-title {
    border-bottom: none !important;
    background: none !important;
  }

  @media (max-width: 768px) {
    .content {
      padding-inline: 1rem;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .auth-container {
      transform: translateY(-5%);
    }
  }

  @media (max-width: 480px) {
    .content {
      padding-inline: 0.75rem;
    }

    h1 {
      font-size: 1.75rem;
      margin-bottom: 1rem;
    }
  }

  .auth-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 400px;
    width: 100%;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  h2 {
    color: white;
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .auth-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: center;
    text-align: center;
  }

  .instruction {
    color: #94a3b8;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .wallet-status {
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
  }

  .wallet-status.error {
    color: #ff4d4d;
    background: rgba(255, 77, 77, 0.1);
  }

  .wallet-status.success {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
  }

  .auth-button {
    background: linear-gradient(135deg, #FFFFFF 0%, #4DA8FF 100%);
    color: #0d111c;
    font-weight: 600;
    border: none;
    padding: 0.75rem 2rem;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 200px;
  }

  .auth-button:disabled {
    background: linear-gradient(135deg, #CCCCCC 0%, #2a5a8a 100%);
    cursor: not-allowed;
    opacity: 0.7;
  }

  .auth-button:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .error-message {
    color: #ff4d4d;
    font-size: 0.875rem;
    margin-top: 0.5rem;
    text-align: center;
  }

  .success-message {
    color: #4ade80;
    font-size: 0.875rem;
    margin-top: 0.5rem;
    text-align: center;
  }

  .vaults-header {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    padding: 0 1.5rem;
    color: white;
    font-size: 2.5rem;
    margin-bottom: 2rem;
    font-weight: 500;
  }

  .name-col {
    padding-left: 0.6rem;
  }

  @media (max-width: 768px) {
    .vaults-header {
      font-size: 2rem;
      margin-bottom: 1.5rem;
      text-align: center;
      padding: 0;
    }

    .name-col {
      padding-left: 0;
    }
  }

  @media (max-width: 480px) {
    .vaults-header {
      font-size: 1.75rem;
      margin-bottom: 1rem;
    }
  }

  .admin-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    max-width: 600px;
    padding: 0 1rem;
  }

  .admin-menu {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 2rem;
  }

  .form-container h2 {
    color: white;
    font-size: 1.5rem;
    margin-bottom: 2rem;
    text-align: center;
  }

  .value-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-group label {
    color: #94a3b8;
    font-size: 0.875rem;
  }

  .input-group input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: white;
    font-size: 1rem;
    width: 100%;
    transition: border-color 0.3s ease;
    -moz-appearance: textfield;
  }

  .input-group input:focus {
    outline: none;
    border-color: #4DA8FF;
  }

  .input-group input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .input-group input::-webkit-outer-spin-button,
  .input-group input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .submit-button {
    background: linear-gradient(135deg, #FFFFFF 0%, #4DA8FF 100%);
    color: #0d111c;
    font-weight: 600;
    border: none;
    padding: 0.75rem 2rem;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
  }

  .submit-button:disabled {
    background: linear-gradient(135deg, #CCCCCC 0%, #2a5a8a 100%);
    cursor: not-allowed;
    opacity: 0.7;
  }

  .submit-button:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    .admin-menu {
      padding: 1.5rem;
    }
  }
</style> 
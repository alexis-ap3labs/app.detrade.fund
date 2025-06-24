interface GitHubActionParams {
  vaultId: string;
  action: 'deposit' | 'withdraw';
  transactionHash: string;
  amount: string;
  userAddress: string;
}

/**
 * Déclenche une GitHub Action pour un vault spécifique après une transaction
 */
export async function triggerGitHubAction(params: GitHubActionParams): Promise<void> {
  try {
    const payload = {
      ...params,
      timestamp: new Date().toISOString()
    };

    const response = await fetch('/api/github/trigger-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to trigger GitHub Action:', errorData);
      // Ne pas throw d'erreur pour ne pas interrompre le flux utilisateur
      return;
    }

    const result = await response.json();
    console.log('GitHub Action triggered successfully:', result);
  } catch (error) {
    console.error('Error triggering GitHub Action:', error);
    // Ne pas throw d'erreur pour ne pas interrompre le flux utilisateur
  }
} 
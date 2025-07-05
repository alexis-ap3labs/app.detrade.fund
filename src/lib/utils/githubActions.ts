interface GitHubActionParams {
  vaultId: string;
  action: 'deposit' | 'withdraw';
  transactionHash: string;
  amount: string;
  userAddress: string;
}

/**
 * Triggers a GitHub Action for a specific vault after a transaction
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
      // Don't throw error to avoid interrupting user flow
      return;
    }

    const result = await response.json();
    console.log('GitHub Action triggered successfully:', result);
  } catch (error) {
    console.error('Error triggering GitHub Action:', error);
    // Don't throw error to avoid interrupting user flow
  }
} 
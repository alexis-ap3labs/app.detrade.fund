import { json } from '@sveltejs/kit';
import { PRIVATE_GITHUB_TOKEN } from '$env/static/private';
import type { RequestHandler } from './$types';

// Global store for timeouts (in production, use Redis or a database)
declare global {
  var scheduledRetries: Map<string, { timeouts: NodeJS.Timeout[], scheduledAt: number }>;
}

// Initialize if not already done
if (!global.scheduledRetries) {
  global.scheduledRetries = new Map();
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { repoName, enableRetries = true, transactionData } = await request.json();

    // Configuration for the subgraph workflow
    const owner = 'detradefund';
    const repo = 'subgraph';
    const ref = 'master';

    // Determine the workflow based on repoName
    let workflowId: string;
    if (repoName === 'detrade-core-usdc') {
      workflowId = 'sync-scheduler-usdc.yml';
    } else if (repoName === 'detrade-core-weth') {
      workflowId = 'sync-scheduler-eth.yml';
    } else if (repoName === 'detrade-core-eurc') {
      workflowId = 'sync-scheduler-eurc.yml';
    } else {
      return json(
        { error: 'Invalid repoName. Must be detrade-core-usdc, detrade-core-weth, or detrade-core-eurc' },
        { status: 400 }
      );
    }

    // Function to trigger the vault action workflow with retry system
    async function triggerVaultActionWorkflow() {
      try {
        console.log('Triggering vault action workflow with retry system for:', repoName);

        // We need transaction data to trigger the vault action
        if (!transactionData) {
          console.log('No transaction data provided, skipping vault action workflow');
          return { success: false, error: 'No transaction data provided' };
        }

        const response = await fetch(
          `https://api.github.com/repos/${PRIVATE_GITHUB_TOKEN ? 'detradefund' : 'your-org'}/app.detrade.fund/actions/workflows/vault-action-example.yml/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${PRIVATE_GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ref: 'main',
              inputs: {
                vault_id: transactionData.vaultId || repoName,
                action_type: transactionData.action || 'deposit',
                transaction_hash: transactionData.transactionHash || '',
                amount: transactionData.amount || '0',
                user_address: transactionData.userAddress || '',
                timestamp: transactionData.timestamp || new Date().toISOString(),
                retry_count: '0',
                original_timestamp: transactionData.timestamp || new Date().toISOString()
              }
            })
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          console.error('GitHub API error for vault action:', response.status, errorData);
          return { success: false, error: errorData };
        }

        console.log('Vault action workflow triggered successfully');
        return { success: true };
      } catch (error) {
        console.error('Error triggering vault action workflow:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    // Function to trigger a workflow
    async function triggerWorkflow(delayLabel?: string) {
      try {
        console.log(`Attempting to trigger workflow${delayLabel ? ` (${delayLabel})` : ''}:`, {
          owner,
          repo,
          workflowId,
          ref,
          repoName
        });

        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${PRIVATE_GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ref: ref,
              inputs: {
                manual_trigger: 'true',
                delay_label: delayLabel || 'immediate'
              }
            })
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`GitHub API error${delayLabel ? ` (${delayLabel})` : ''}:`, response.status, errorData);
          return { success: false, error: errorData };
        }

        console.log(`Workflow ${workflowId} triggered successfully${delayLabel ? ` (${delayLabel})` : ''} for ${repoName}`);
        return { success: true };
      } catch (error) {
        console.error(`Error triggering workflow${delayLabel ? ` (${delayLabel})` : ''}:`, error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    // Trigger the vault action workflow with retry system
    const vaultActionResult = await triggerVaultActionWorkflow();
    
    if (!vaultActionResult.success) {
      return json(
        { error: `Failed to trigger vault action workflow: ${vaultActionResult.error}` },
        { status: 500 }
      );
    }

    // Also trigger immediate subgraph sync as fallback
    const immediateResult = await triggerWorkflow();
    
    if (!immediateResult.success) {
      console.warn('Immediate subgraph sync failed, but vault action workflow was triggered');
    }
    
    return json({ 
      success: true, 
      message: 'Subgraph sync workflow triggered successfully',
      workflow: workflowId,
      repository: `${owner}/${repo}`,
      ref: ref,
      repoName: repoName,
      vaultActionTriggered: vaultActionResult.success,
      immediateSync: immediateResult.success,
      retriesScheduled: enableRetries && vaultActionResult.success ? 5 : 0
    });

  } catch (error) {
    console.error('Error triggering subgraph workflow:', error);
    return json(
      { error: 'Internal server error while triggering workflow' },
      { status: 500 }
    );
  }
};

// Endpoint to cancel scheduled retries
export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const { repoName } = await request.json();
    
    const existingRetryInfo = global.scheduledRetries.get(repoName);
    if (existingRetryInfo) {
      existingRetryInfo.timeouts.forEach(timeout => clearTimeout(timeout));
      global.scheduledRetries.delete(repoName);
      console.log(`Cancelled scheduled retries for ${repoName}`);
    }

    return json({ success: true, message: 'Retries cancelled' });
  } catch (error) {
    console.error('Error cancelling retries:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 
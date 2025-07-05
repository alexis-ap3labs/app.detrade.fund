import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';

interface GitHubActionPayload {
  vaultId: string;
  action: 'deposit' | 'withdraw';
  transactionHash: string;
  amount: string;
  userAddress: string;
  timestamp: string;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload: GitHubActionPayload = await request.json();
    const { vaultId, action, transactionHash, amount, userAddress, timestamp } = payload;

    // Check that GitHub token is configured
    const githubToken = env.PRIVATE_GITHUB_TOKEN;
    if (!githubToken) {
      console.error('GitHub token not configured');
      return json({ error: 'GitHub integration not configured' }, { status: 500 });
    }

    // Mapping des vaults vers leurs workflows dans le repository detradefund/subgraph
    const vaultActions = {
      'detrade-core-usdc': {
        repository: 'detradefund/subgraph',
        workflow: 'sync-scheduler-usdc.yml'
      },
      'detrade-core-eth': {
        repository: 'detradefund/subgraph',
        workflow: 'sync-scheduler-eth.yml'
      },
      'detrade-core-eurc': {
        repository: 'detradefund/subgraph',
        workflow: 'sync-scheduler-eurc.yml'
      },
      'dev-detrade-core-usdc': {
        repository: 'detradefund/subgraph',
        workflow: 'sync-scheduler-usdc.yml'
      }
    };

    const vaultConfig = vaultActions[vaultId as keyof typeof vaultActions];
    if (!vaultConfig) {
      console.error(`No GitHub Action configured for vault: ${vaultId}`);
      return json({ error: `No GitHub Action configured for vault: ${vaultId}` }, { status: 400 });
    }

    // Prepare inputs for GitHub Action
    const workflowInputs = {
      manual_trigger: 'true'
    };

    // Trigger the GitHub Action
    const response = await fetch(
      `https://api.github.com/repos/${vaultConfig.repository}/actions/workflows/${vaultConfig.workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'master', // or the branch you're using
          inputs: workflowInputs
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);
      return json({ 
        error: 'Failed to trigger GitHub Action',
        details: errorText
      }, { status: response.status });
    }

    console.log(`GitHub Action triggered for vault ${vaultId}, action: ${action}`);
    
    return json({ 
      success: true, 
      message: `GitHub Action triggered for ${vaultId}`,
      workflow: vaultConfig.workflow,
      repository: vaultConfig.repository
    });

  } catch (error) {
    console.error('Error triggering GitHub Action:', error);
    return json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}; 
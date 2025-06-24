import { json } from '@sveltejs/kit';
import { PRIVATE_GITHUB_TOKEN } from '$env/static/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { repoName } = await request.json();

    // Configuration pour le workflow subgraph
    const owner = 'detradefund';
    const repo = 'subgraph';
    const ref = 'master';

    // Déterminer le workflow selon le repoName
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

    console.log(`Attempting to trigger workflow:`, {
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
            manual_trigger: 'true'
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('GitHub API error:', response.status, errorData);
      return json(
        { error: `Failed to trigger workflow: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    console.log(`Workflow ${workflowId} triggered successfully for ${repoName}`);
    
    return json({ 
      success: true, 
      message: 'Subgraph sync workflow triggered successfully',
      workflow: workflowId,
      repository: `${owner}/${repo}`,
      ref: ref,
      repoName: repoName
    });

  } catch (error) {
    console.error('Error triggering subgraph workflow:', error);
    return json(
      { error: 'Internal server error while triggering workflow' },
      { status: 500 }
    );
  }
}; 
import { json } from '@sveltejs/kit';
import { PRIVATE_GITHUB_TOKEN } from '$env/static/private';
import type { RequestHandler } from './$types';

// Store global pour les timeouts (en production, utilisez Redis ou une base de données)
declare global {
  var scheduledRetries: Map<string, { timeouts: NodeJS.Timeout[], scheduledAt: number }>;
}

// Initialiser si pas déjà fait
if (!global.scheduledRetries) {
  global.scheduledRetries = new Map();
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { repoName, enableRetries = true } = await request.json();

    // Configuration pour le workflow subgraph
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

    // Fonction pour déclencher un workflow
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

    // Déclencher immédiatement
    const immediateResult = await triggerWorkflow();
    
    if (!immediateResult.success) {
      return json(
        { error: `Failed to trigger immediate workflow: ${immediateResult.error}` },
        { status: 500 }
      );
    }

    // Programmer les retries échelonnés côté serveur si activé
    if (enableRetries) {
      // Nettoyer les anciens timeouts s'ils existent
      const existingRetryInfo = global.scheduledRetries.get(repoName);
      if (existingRetryInfo) {
        existingRetryInfo.timeouts.forEach(timeout => clearTimeout(timeout));
      }

      // Délais échelonnés
      const delays = [
        { minutes: 3, label: '3 minutes' },
        { minutes: 10, label: '10 minutes' },
        { minutes: 30, label: '30 minutes' },
        { minutes: 60, label: '1 hour' },
        { minutes: 180, label: '3 hours' }
      ];

      // Programmer les retries
      const timeouts = delays.map(({ minutes, label }) => {
        return setTimeout(async () => {
          console.log(`[Server Retry] Triggering sync after ${label} for:`, repoName);
          await triggerWorkflow(label);
        }, minutes * 60 * 1000);
      });

      // Stocker les timeouts pour pouvoir les annuler si nécessaire
      global.scheduledRetries.set(repoName, {
        timeouts,
        scheduledAt: Date.now()
      });

      console.log(`[Server Retry] Scheduled ${delays.length} retries for ${repoName}`);
    }
    
    return json({ 
      success: true, 
      message: 'Subgraph sync workflow triggered successfully',
      workflow: workflowId,
      repository: `${owner}/${repo}`,
      ref: ref,
      repoName: repoName,
      retriesScheduled: enableRetries ? 5 : 0,
      immediate: immediateResult.success
    });

  } catch (error) {
    console.error('Error triggering subgraph workflow:', error);
    return json(
      { error: 'Internal server error while triggering workflow' },
      { status: 500 }
    );
  }
};

// Endpoint pour annuler les retries programmés
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
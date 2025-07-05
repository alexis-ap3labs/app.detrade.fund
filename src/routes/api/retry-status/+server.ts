import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// This variable will be shared with the other endpoint
// In production, use Redis or a database to persist between restarts
declare global {
  var scheduledRetries: Map<string, { timeouts: NodeJS.Timeout[], scheduledAt: number }>;
}

// Initialize if not already done
if (!global.scheduledRetries) {
  global.scheduledRetries = new Map();
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoName = url.searchParams.get('repoName');
    
    if (repoName) {
      // Status for a specific vault
      const retryInfo = global.scheduledRetries.get(repoName);
      
      if (!retryInfo) {
        return json({
          repoName,
          hasScheduledRetries: false,
          message: 'No scheduled retries for this vault'
        });
      }
      
      const now = Date.now();
      const scheduledAt = retryInfo.scheduledAt;
      const timeSinceScheduled = now - scheduledAt;
      
      // Calculate next delays
      const delays = [
        { minutes: 3, label: '3 minutes' },
        { minutes: 10, label: '10 minutes' },
        { minutes: 30, label: '30 minutes' },
        { minutes: 60, label: '1 hour' },
        { minutes: 180, label: '3 hours' }
      ];
      
      const nextRetries = delays.map(({ minutes, label }) => {
        const delayMs = minutes * 60 * 1000;
        const executeAt = scheduledAt + delayMs;
        const timeUntilExecution = executeAt - now;
        
        return {
          label,
          delayMinutes: minutes,
          executeAt: new Date(executeAt).toISOString(),
          timeUntilExecutionMs: timeUntilExecution,
          hasExecuted: timeUntilExecution <= 0
        };
      });
      
      return json({
        repoName,
        hasScheduledRetries: true,
        scheduledAt: new Date(scheduledAt).toISOString(),
        timeSinceScheduledMs: timeSinceScheduled,
        activeTimeouts: retryInfo.timeouts.length,
        nextRetries
      });
      
    } else {
      // Status for all vaults
      const allRetries = Array.from(global.scheduledRetries.entries()).map(([repo, info]) => {
        const now = Date.now();
        return {
          repoName: repo,
          scheduledAt: new Date(info.scheduledAt).toISOString(),
          timeSinceScheduledMs: now - info.scheduledAt,
          activeTimeouts: info.timeouts.length
        };
      });
      
      return json({
        totalScheduledVaults: allRetries.length,
        vaults: allRetries,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Error checking retry status:', error);
    return json(
      { error: 'Internal server error while checking retry status' },
      { status: 500 }
    );
  }
}; 
import type { PpsHistoryData } from '$lib/stores/pps';

/**
 * Calculates the 30-day Annual Percentage Rate (APR) based on share prices (PPS).
 * Uses ppsFormatted values which are already properly formatted with the correct decimals.
 * If less than 30 days of data is available, it will use the oldest available data point.
 * @param events Array of PPS events sorted by timestamp
 * @returns The calculated 30-day APR as a percentage, or null if insufficient data
 */
export function calculate30DayApr(events: PpsHistoryData[]): number | null {
  if (events.length < 2) {
    return null;
  }

  // Sort events by date (most recent to oldest)
  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Get the most recent share price (already formatted)
  const latestPps = sortedEvents[0].ppsFormatted;
  
  // Calculate the date 30 days ago (in milliseconds)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  // Find the share price closest to 30 days ago (already formatted)
  const pastPps = sortedEvents.find(event => new Date(event.timestamp).getTime() <= thirtyDaysAgo)?.ppsFormatted;
  
  // If we have more than 30 days of history, use the point closest to 30 days
  // Otherwise, use the oldest available data point
  const referencePps = pastPps || sortedEvents[sortedEvents.length - 1].ppsFormatted;
  const referenceTimestamp = pastPps 
    ? sortedEvents.find(event => event.ppsFormatted === pastPps)!.timestamp
    : sortedEvents[sortedEvents.length - 1].timestamp;
  
  // Calculate the return over the available period
  // Return is calculated as (new price - old price) / old price
  // Prices are already formatted with correct decimals
  const periodReturn = (latestPps - referencePps) / referencePps;
  
  // Calculate number of days between the two points
  const daysBetween = (new Date(sortedEvents[0].timestamp).getTime() - new Date(referenceTimestamp).getTime()) / (24 * 60 * 60 * 1000);
  
  // Annualize the return by adjusting for the actual period
  // If the period is very short (< 1 day), use a minimum period of 1 day
  const adjustedDays = Math.max(daysBetween, 1);
  const apr = periodReturn * (365 / adjustedDays);
  
  // Return the APR as a percentage
  return apr * 100;
} 
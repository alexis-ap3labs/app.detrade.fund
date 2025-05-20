import type { PpsEvent } from '$lib/stores/pps';

/**
 * Calculates the 30-day Annual Percentage Rate (APR) based on share prices (PPS).
 * Uses ppsFormatted values which are already properly formatted with the correct decimals.
 * If less than 30 days of data is available, it will use the oldest available data point.
 * @param events Array of PPS events sorted by timestamp
 * @returns The calculated 30-day APR as a percentage, or null if insufficient data
 */
export function calculate30DayApr(events: PpsEvent[]): number | null {
  if (events.length < 2) {
    return null;
  }

  // Trier les événements par date (du plus récent au plus ancien)
  const sortedEvents = [...events].sort((a, b) => b.blockTimestamp - a.blockTimestamp);
  
  // Prendre le prix des parts le plus récent (déjà formaté)
  const latestPps = sortedEvents[0].ppsFormatted;
  
  // Calculer la date d'il y a 30 jours (en secondes)
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  
  // Trouver le prix des parts le plus proche d'il y a 30 jours (déjà formaté)
  const pastPps = sortedEvents.find(event => event.blockTimestamp <= thirtyDaysAgo)?.ppsFormatted;
  
  // Si on a plus de 30 jours d'historique, on utilise le point le plus proche de 30 jours
  // Sinon, on utilise le point le plus ancien disponible
  const referencePps = pastPps || sortedEvents[sortedEvents.length - 1].ppsFormatted;
  const referenceTimestamp = pastPps 
    ? sortedEvents.find(event => event.ppsFormatted === pastPps)!.blockTimestamp
    : sortedEvents[sortedEvents.length - 1].blockTimestamp;
  
  // Calculer le rendement sur la période disponible
  // Le rendement est calculé comme (nouveau prix - ancien prix) / ancien prix
  // Les prix sont déjà formatés avec les bonnes décimales
  const periodReturn = (latestPps - referencePps) / referencePps;
  
  // Calculer le nombre de jours entre les deux points
  const daysBetween = (sortedEvents[0].blockTimestamp - referenceTimestamp) / (24 * 60 * 60);
  
  // Annualiser le rendement en ajustant pour la période réelle
  // Si la période est très courte (< 1 jour), on utilise une période minimale de 1 jour
  const adjustedDays = Math.max(daysBetween, 1);
  const apr = periodReturn * (365 / adjustedDays);
  
  // Retourner l'APR en pourcentage
  return apr * 100;
} 
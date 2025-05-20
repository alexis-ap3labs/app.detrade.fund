import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    
    // Vérifier si le vault existe
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Vérifier l'URI MongoDB
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connexion à MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');

    // Récupérer tous les événements totalAssetsUpdated
    const totalAssetsEvents = await collection
      .find({ 
        type: 'totalAssetsUpdated',
        blockTimestamp: { $exists: true, $ne: null }
      })
      .sort({ blockTimestamp: -1 })
      .toArray();

    // Transformer les événements et récupérer les événements associés
    const allEvents = [];
    
    for (const event of totalAssetsEvents) {
      // Obtenir le hash de transaction
      let transactionHash = '';
      if ('transactionHash' in event && event.transactionHash) {
        transactionHash = event.transactionHash;
      } else {
        const hashFromId = event.id.match(/^(0x[a-f0-9]{64})/)?.[1];
        if (hashFromId) {
          transactionHash = hashFromId;
        }
      }

      if (transactionHash) {
        // Récupérer tous les événements avec ce hash
        const relatedEvents = await collection
          .find({
            $or: [
              { transactionHash },
              { id: { $regex: `^${transactionHash}` } }
            ]
          })
          .toArray();

        // Calculer le PPS
        const ppsResult = calculatePps(event, relatedEvents, vault.underlyingTokenDecimals);
        if (ppsResult) {
          allEvents.push({
            timestamp: new Date(parseInt(event.blockTimestamp) * 1000).toISOString(),
            blockTimestamp: parseInt(event.blockTimestamp),
            transactionHash,
            pps: ppsResult.raw,
            ppsFormatted: ppsResult.formatted,
            relatedEvents: relatedEvents.map(e => ({
              type: e.type,
              blockTimestamp: e.blockTimestamp,
              id: e.id,
              ...e
            }))
          });
        }
      }
    }

    // Préparer les détails du calcul
    const sortedEvents = [...allEvents].sort((a, b) => b.blockTimestamp - a.blockTimestamp);
    const latestPps = Number(sortedEvents[0]?.ppsFormatted.toFixed(6));
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    // Trouver les deux points les plus proches de 7 jours
    let closestEvent = sortedEvents[0];
    let secondClosestEvent = sortedEvents[0];
    let minDaysDiff = Infinity;
    let secondMinDaysDiff = Infinity;
    
    for (const event of sortedEvents) {
      const daysDiff = Math.abs((sortedEvents[0].blockTimestamp - event.blockTimestamp) / (24 * 60 * 60) - 7);
      if (daysDiff < minDaysDiff) {
        secondMinDaysDiff = minDaysDiff;
        secondClosestEvent = closestEvent;
        minDaysDiff = daysDiff;
        closestEvent = event;
      } else if (daysDiff < secondMinDaysDiff) {
        secondMinDaysDiff = daysDiff;
        secondClosestEvent = event;
      }
    }
    
    // Trier les deux événements par date
    const [beforeEvent, afterEvent] = [closestEvent, secondClosestEvent].sort((a, b) => a.blockTimestamp - b.blockTimestamp);
    
    // Calculer l'interpolation linéaire pour obtenir la valeur à exactement 7 jours
    const targetTimestamp = sortedEvents[0].blockTimestamp - (7 * 24 * 60 * 60);
    const timeRange = afterEvent.blockTimestamp - beforeEvent.blockTimestamp;
    const timeFromBefore = targetTimestamp - beforeEvent.blockTimestamp;
    const interpolationFactor = timeFromBefore / timeRange;
    
    const beforePps = Number(beforeEvent.ppsFormatted.toFixed(6));
    const afterPps = Number(afterEvent.ppsFormatted.toFixed(6));
    const interpolatedPps = Number((beforePps + (afterPps - beforePps) * interpolationFactor).toFixed(6));
    
    // Calculer la durée exacte de 7 jours en secondes
    const durationInSeconds = 7 * 24 * 60 * 60;
    const durationInYears = Number((durationInSeconds / (365 * 24 * 60 * 60)).toFixed(8));

    // Calculer le rendement sur la période
    const periodReturn = Number(((latestPps - interpolatedPps) / interpolatedPps).toFixed(6));

    // Calculer l'APR en extrapolant sur une année
    const calculatedApr = Number(((periodReturn / durationInYears) * 100).toFixed(2));

    return json({
      apr: calculatedApr,
      calculationDetails: {
        latestEvent: {
          timestamp: new Date(sortedEvents[0]?.blockTimestamp * 1000).toISOString(),
          pps: latestPps,
          transactionHash: sortedEvents[0]?.transactionHash
        },
        interpolatedEvent: {
          timestamp: new Date(targetTimestamp * 1000).toISOString(),
          pps: interpolatedPps,
          isInterpolated: true
        },
        referenceEvents: {
          before: {
            timestamp: new Date(beforeEvent.blockTimestamp * 1000).toISOString(),
            pps: beforePps,
            transactionHash: beforeEvent.transactionHash
          },
          after: {
            timestamp: new Date(afterEvent.blockTimestamp * 1000).toISOString(),
            pps: afterPps,
            transactionHash: afterEvent.transactionHash
          }
        },
        formula: {
          periodReturn: `(${latestPps} - ${interpolatedPps}) / ${interpolatedPps} = ${(periodReturn * 100).toFixed(6)}%`,
          durationInSeconds: durationInSeconds,
          durationInYears: durationInYears,
          interpolation: {
            factor: interpolationFactor.toFixed(4),
            beforePps: beforePps,
            afterPps: afterPps,
            formula: `${beforePps} + (${afterPps} - ${beforePps}) * ${interpolationFactor.toFixed(4)} = ${interpolatedPps}`
          },
          aprFormula: `(${(periodReturn * 100).toFixed(6)}% / ${durationInYears} years) * 100 = ${calculatedApr}% (extrapolé sur 1 an, basé sur exactement 7 jours)`
        }
      }
    });
  } catch (error) {
    console.error('Error calculating APR:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

function calculatePps(event: any, relatedEvents: any[], decimals: number): { raw: string, formatted: number } | null {
  let rawPps: string;
  
  // Look for settleDeposit event first
  const settleDepositEvent = relatedEvents.find(e => e.type === 'settleDeposit');
  if (settleDepositEvent?.totalAssets && settleDepositEvent?.totalSupply) {
    try {
      // Calculate PPS as totalAssets/totalSupply
      const totalAssets = BigInt(settleDepositEvent.totalAssets);
      const totalSupply = BigInt(settleDepositEvent.totalSupply);
      
      // Normalize totalAssets to 18 decimals if needed (for USDC)
      const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
      
      // Calculate PPS: (normalizedAssets * 1e18) / totalSupply
      const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
      
      rawPps = ppsValue.toString();
    } catch (error) {
      console.error('Error calculating PPS:', error);
      // Fallback to 1e18 if calculation fails
      rawPps = Math.pow(10, 18).toString();
    }
  } else {
    // If no settleDeposit, look for settleRedeem event
    const settleRedeemEvent = relatedEvents.find(e => e.type === 'settleRedeem');
    if (settleRedeemEvent?.totalAssets && settleRedeemEvent?.totalSupply) {
      try {
        // Calculate PPS as totalAssets/totalSupply
        const totalAssets = BigInt(settleRedeemEvent.totalAssets);
        const totalSupply = BigInt(settleRedeemEvent.totalSupply);
        
        // Normalize totalAssets to 18 decimals if needed (for USDC)
        const normalizedAssets = totalAssets * BigInt(Math.pow(10, 18 - decimals));
        
        // Calculate PPS: (normalizedAssets * 1e18) / totalSupply
        const ppsValue = (normalizedAssets * BigInt(Math.pow(10, 18))) / totalSupply;
        
        rawPps = ppsValue.toString();
      } catch (error) {
        console.error('Error calculating PPS:', error);
        // Fallback to 1e18 if calculation fails
        rawPps = Math.pow(10, 18).toString();
      }
    } else {
      // If no settleRedeem, look for highWaterMarkUpdated event
      const highWaterMarkEvent = relatedEvents.find(e => e.type === 'highWaterMarkUpdated');
      if (highWaterMarkEvent?.newHighWaterMark) {
        // Convert highWaterMark to wei (multiply by 1e18)
        const highWaterMarkValue = Number(highWaterMarkEvent.newHighWaterMark) / Math.pow(10, decimals);
        rawPps = (BigInt(Math.floor(highWaterMarkValue * Math.pow(10, 18)))).toString();
      } else {
        // If we only have totalAssetsUpdated, we ignore it
        return null;
      }
    }
  }

  const formatted = Number(rawPps) / Math.pow(10, 18);
  
  return {
    raw: rawPps,
    formatted
  };
} 
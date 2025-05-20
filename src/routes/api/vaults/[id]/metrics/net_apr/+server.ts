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

    // Calculer le netAPR en comparant le point le plus ancien avec le plus récent
    const result = calculateNetApr(allEvents);

    return json(result);
  } catch (error) {
    console.error('Error calculating net APR:', error);
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

function calculateNetApr(events: any[]): { 
  apr: number, 
  startDate: string, 
  endDate: string, 
  totalReturn: number,
  oldestPps: number,
  newestPps: number,
  durationInDays: number,
  calculationDetails: {
    oldestEvent: {
      timestamp: string,
      pps: number,
      transactionHash: string
    },
    newestEvent: {
      timestamp: string,
      pps: number,
      transactionHash: string
    },
    formula: {
      totalReturn: string,
      durationInYears: number,
      aprFormula: string,
      durationInSeconds: number
    }
  }
} {
  if (events.length < 2) {
    return {
      apr: 0,
      startDate: '',
      endDate: '',
      totalReturn: 0,
      oldestPps: 0,
      newestPps: 0,
      durationInDays: 0,
      calculationDetails: {
        oldestEvent: {
          timestamp: '',
          pps: 0,
          transactionHash: ''
        },
        newestEvent: {
          timestamp: '',
          pps: 0,
          transactionHash: ''
        },
        formula: {
          totalReturn: '',
          durationInYears: 0,
          aprFormula: '',
          durationInSeconds: 0
        }
      }
    };
  }

  // Trier les événements par date (du plus ancien au plus récent)
  const sortedEvents = [...events].sort((a, b) => a.blockTimestamp - b.blockTimestamp);
  
  // Prendre le premier et le dernier événement
  const oldestEvent = sortedEvents[0];
  const newestEvent = sortedEvents[sortedEvents.length - 1];
  
  // Calculer le rendement total avec une précision de 6 décimales
  const oldestPps = Number(oldestEvent.ppsFormatted.toFixed(6));
  const newestPps = Number(newestEvent.ppsFormatted.toFixed(6));
  const totalReturn = Number(((newestPps - oldestPps) / oldestPps).toFixed(6));
  
  // Calculer la durée en secondes
  const durationInSeconds = newestEvent.blockTimestamp - oldestEvent.blockTimestamp;
  // Calculer la durée en années (même si très courte)
  const durationInYears = Number((durationInSeconds / (365 * 24 * 60 * 60)).toFixed(8));
  const durationInDays = Number((durationInSeconds / (24 * 60 * 60)).toFixed(4));
  
  // Calculer l'APR annualisé
  let apr;
  if (durationInYears >= 1) {
    // Si la durée est supérieure ou égale à 1 an, on calcule le rendement annualisé moyen
    apr = Number(((Math.pow(1 + totalReturn, 1 / durationInYears) - 1) * 100).toFixed(2));
  } else {
    // Si la durée est inférieure à 1 an, on extrapole le rendement sur une année
    apr = Number(((totalReturn / durationInYears) * 100).toFixed(2));
  }
  
  return {
    apr,
    startDate: new Date(oldestEvent.blockTimestamp * 1000).toISOString(),
    endDate: new Date(newestEvent.blockTimestamp * 1000).toISOString(),
    totalReturn: Number((totalReturn * 100).toFixed(6)), // Convertir en pourcentage avec 6 décimales
    oldestPps,
    newestPps,
    durationInDays: Math.round(durationInDays),
    calculationDetails: {
      oldestEvent: {
        timestamp: new Date(oldestEvent.blockTimestamp * 1000).toISOString(),
        pps: oldestPps,
        transactionHash: oldestEvent.transactionHash
      },
      newestEvent: {
        timestamp: new Date(newestEvent.blockTimestamp * 1000).toISOString(),
        pps: newestPps,
        transactionHash: newestEvent.transactionHash
      },
      formula: {
        totalReturn: `(${newestPps} - ${oldestPps}) / ${oldestPps} = ${(totalReturn * 100).toFixed(6)}%`,
        durationInYears: durationInYears,
        durationInSeconds: durationInSeconds,
        aprFormula: durationInYears >= 1 
          ? `(1 + ${(totalReturn * 100).toFixed(6)}%)^(1/${durationInYears.toFixed(2)}) - 1 = ${apr}% (rendement annualisé moyen)`
          : `(${(totalReturn * 100).toFixed(6)}% / ${durationInYears.toFixed(2)} years) * 100 = ${apr}% (extrapolé sur 1 an)`
      }
    }
  };
} 
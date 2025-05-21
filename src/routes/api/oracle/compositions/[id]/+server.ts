import { json } from '@sveltejs/kit';
import clientPromise from '$lib/mongodb';
import { ALL_VAULTS } from '$lib/vaults';
import type { RequestHandler } from './$types';
import type { Document, WithId } from 'mongodb';

interface OracleDocument {
  timestamp: string;
  overview: {
    summary: {
      total_value_usdc?: string;
      total_value_weth?: string;
      spot_value_usdc?: string;
      spot_value_weth?: string;
    };
    positions: Record<string, string>;
  };
}

interface Allocation {
  percentage: number;
  value_usdc: string;
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { id } = params;
    console.log('Fetching latest composition for vault:', id);
    
    // Vérifier si le vault existe
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      console.log('Vault not found:', id);
      return json(
        { error: 'Vault not found' },
        { status: 404 }
      );
    }

    // Connexion à MongoDB
    const client = await clientPromise;
    console.log('Connected to MongoDB');
    
    const db = client.db(id);
    console.log('Using database:', id);

    const collection = db.collection('oracle');
    
    // Récupérer le document le plus récent
    const latestComposition = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    if (!latestComposition || latestComposition.length === 0) {
      console.log('No composition data found for vault:', id);
      return json(
        { error: 'No composition data found' },
        { status: 404 }
      );
    }

    const rawComposition = latestComposition[0] as WithId<Document>;
    const composition = {
      timestamp: rawComposition.timestamp as string,
      overview: {
        summary: {
          total_value_usdc: rawComposition.overview?.summary?.total_value_usdc as string,
          total_value_weth: rawComposition.overview?.summary?.total_value_weth as string,
          spot_value_usdc: rawComposition.overview?.summary?.spot_value_usdc as string,
          spot_value_weth: rawComposition.overview?.summary?.spot_value_weth as string
        },
        positions: rawComposition.overview?.positions as Record<string, string>
      }
    } as OracleDocument;

    console.log('Latest composition found:', composition);

    // Calculer les pourcentages de répartition
    const isEthVault = id === 'detrade-core-eth';
    const totalValue = parseFloat(isEthVault ? composition.overview.summary.total_value_weth || '0' : composition.overview.summary.total_value_usdc || '0');
    const positions = composition.overview.positions;
    const spotValue = parseFloat(isEthVault ? composition.overview.summary.spot_value_weth || '0' : composition.overview.summary.spot_value_usdc || '0');

    // Vérifier que les valeurs sont valides
    if (isNaN(totalValue) || totalValue <= 0) {
      console.error('Invalid total value:', {
        raw: isEthVault ? composition.overview.summary.total_value_weth : composition.overview.summary.total_value_usdc,
        parsed: totalValue,
        vaultId: id
      });
      return json(
        { error: 'Invalid total value in composition data' },
        { status: 400 }
      );
    }

    if (isNaN(spotValue) || spotValue < 0) {
      console.error('Invalid spot value:', {
        raw: isEthVault ? composition.overview.summary.spot_value_weth : composition.overview.summary.spot_value_usdc,
        parsed: spotValue,
        vaultId: id
      });
      return json(
        { error: 'Invalid spot value in composition data' },
        { status: 400 }
      );
    }

    // Calculer les pourcentages et valeurs pour chaque position
    const allocation: Record<string, Allocation> = {};
    
    // Ajouter les positions
    Object.entries(positions).forEach(([position, value]) => {
      const positionValue = parseFloat(value);
      if (!isNaN(positionValue) && positionValue >= 0) {
        const percentage = (positionValue / totalValue) * 100;
        allocation[position] = {
          percentage: Number(percentage.toFixed(2)),
          value_usdc: isEthVault ? `${positionValue} WETH` : value
        };
      } else {
        console.warn(`Invalid position value for ${position}:`, value);
      }
    });

    // Ajouter le spot seulement si sa valeur est valide
    if (spotValue > 0) {
      allocation['spot'] = {
        percentage: Number(((spotValue / totalValue) * 100).toFixed(2)),
        value_usdc: isEthVault ? `${spotValue} WETH` : composition.overview.summary.spot_value_usdc
      };
    }
    
    // Vérifier qu'il y a au moins une position valide
    if (Object.keys(allocation).length === 0) {
      console.error('No valid positions found in composition data');
      return json(
        { error: 'No valid positions in composition data' },
        { status: 400 }
      );
    }

    return json({
      compositions: {
        _id: rawComposition._id.toString(),
        timestamp: composition.timestamp,
        total_value_usdc: isEthVault ? `${totalValue} WETH` : (composition.overview.summary.total_value_usdc || '0'),
        allocation
      }
    });
  } catch (error) {
    console.error('Error fetching composition:', error);
    return json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}; 
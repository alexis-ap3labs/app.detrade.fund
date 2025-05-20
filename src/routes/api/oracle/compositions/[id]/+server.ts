import { json } from '@sveltejs/kit';
import clientPromise from '$lib/mongodb';
import { ALL_VAULTS } from '$lib/vaults';
import type { RequestHandler } from './$types';
import type { Document, WithId } from 'mongodb';

interface OracleDocument {
  timestamp: string;
  overview: {
    summary: {
      total_value_usdc: string;
      spot_value_usdc: string;
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
          spot_value_usdc: rawComposition.overview?.summary?.spot_value_usdc as string
        },
        positions: rawComposition.overview?.positions as Record<string, string>
      }
    } as OracleDocument;

    console.log('Latest composition found:', composition);

    // Calculer les pourcentages de répartition
    const totalValue = parseFloat(composition.overview.summary.total_value_usdc);
    const positions = composition.overview.positions;
    const spotValue = parseFloat(composition.overview.summary.spot_value_usdc);

    // Calculer les pourcentages et valeurs pour chaque position
    const allocation: Record<string, Allocation> = {};
    
    // Ajouter les positions
    Object.entries(positions).forEach(([position, value]) => {
      const positionValue = parseFloat(value);
      const percentage = (positionValue / totalValue) * 100;
      allocation[position] = {
        percentage: Number(percentage.toFixed(2)),
        value_usdc: value
      };
    });

    // Ajouter le spot
    allocation['spot'] = {
      percentage: Number(((spotValue / totalValue) * 100).toFixed(2)),
      value_usdc: composition.overview.summary.spot_value_usdc
    };
    
    return json({
      compositions: {
        _id: rawComposition._id.toString(),
        timestamp: composition.timestamp,
        total_value_usdc: composition.overview.summary.total_value_usdc,
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
import { json } from '@sveltejs/kit';
import clientPromise from '$lib/mongodb';
import { ALL_VAULTS } from '$lib/vaults';
import type { RequestHandler } from './$types';
import type { Document, WithId } from 'mongodb';

interface OracleDocument {
  timestamp: string;
  nav: {
    usdc?: string;
    weth?: string;
    share_price: string;
    total_supply: string;
  };
  positions?: Record<string, string>;
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
      nav: {
        usdc: rawComposition.nav?.usdc as string,
        weth: rawComposition.nav?.weth as string,
        share_price: rawComposition.nav?.share_price as string,
        total_supply: rawComposition.nav?.total_supply as string
      },
      positions: rawComposition.positions as Record<string, string>
    } as OracleDocument;

    console.log('Latest composition found:', composition);

    // Calculer les pourcentages de répartition
    const isEthVault = id === 'detrade-core-eth';
    const totalValue = parseFloat(isEthVault ? composition.nav.weth || '0' : composition.nav.usdc || '0');
    const positions = composition.positions || {};
    const spotValue = 0; // Nous n'avons plus de spot value dans la nouvelle structure

    // Vérifier que les valeurs sont valides
    if (isNaN(totalValue) || totalValue <= 0) {
      console.error('Invalid total value:', {
        raw: isEthVault ? composition.nav.weth : composition.nav.usdc,
        parsed: totalValue,
        vaultId: id
      });
      return json(
        { error: 'Invalid total value in composition data' },
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
        total_value_usdc: isEthVault ? `${totalValue} WETH` : composition.nav.usdc,
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
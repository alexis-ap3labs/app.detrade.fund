import { json } from '@sveltejs/kit';
import clientPromise from '$lib/mongodb';
import { ALL_VAULTS } from '$lib/vaults';
import type { RequestHandler } from './$types';
import type { Document, WithId } from 'mongodb';

interface DebankDocument {
  timestamp: string;
  nav: {
    usdc?: string;
    weth?: string;
    eurc?: string;
    eth?: string;
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
    console.log('Fetching latest composition for vault (debank):', id);
    
    // Check if vault exists
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      console.log('Vault not found:', id);
      return json(
        { error: 'Vault not found' },
        { status: 404 }
      );
    }

    // Connect to MongoDB
    const client = await clientPromise;
    console.log('Connected to MongoDB');
    
    const db = client.db(id);
    console.log('Using database:', id);

    const collection = db.collection('debank');
    
    // Get the most recent document
    const latestComposition = await collection
      .find({
        timestamp: { $regex: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/ }
      })
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
        eurc: rawComposition.nav?.eurc as string,
        eth: rawComposition.nav?.eth as string,
        share_price: rawComposition.nav?.share_price as string,
        total_supply: rawComposition.nav?.total_supply as string
      },
      positions: rawComposition.positions as Record<string, string>
    } as DebankDocument;

    console.log('Latest composition found:', composition);

    // Calculate allocation percentages
    const isEthVault = id === 'detrade-core-eth';
    const isEurcVault = id === 'detrade-core-eurc';
    
    let totalValue: number;
    if (isEthVault) {
      totalValue = parseFloat(composition.nav.weth || composition.nav.eth || '0');
    } else if (isEurcVault) {
      totalValue = parseFloat(composition.nav.eurc || '0');
    } else {
      totalValue = parseFloat(composition.nav.usdc || '0');
    }
    
    const positions = composition.positions || {};

    // Check that values are valid
    if (isNaN(totalValue) || totalValue <= 0) {
      console.error('Invalid total value:', {
        raw: isEthVault ? (composition.nav.weth || composition.nav.eth) : isEurcVault ? composition.nav.eurc : composition.nav.usdc,
        parsed: totalValue,
        vaultId: id
      });
      return json(
        { error: 'Invalid total value in composition data' },
        { status: 400 }
      );
    }

    // Convertir les positions en ETH si besoin et calculer la somme totale des positions
    let sumPositions = 0;
    const convertedPositions: Record<string, number> = {};
    Object.entries(positions).forEach(([position, value]) => {
      let positionValue = parseFloat(value);
      if (!isNaN(positionValue) && positionValue >= 0) {
        if (isEthVault && positionValue > 1e6) {
          positionValue = positionValue / Math.pow(10, 18);
        }
        convertedPositions[position] = positionValue;
        sumPositions += positionValue;
      }
    });

    // Calculer les pourcentages et valeurs pour chaque position
    const allocation: Record<string, Allocation> = {};
    Object.entries(convertedPositions).forEach(([position, positionValue]) => {
      const percentage = sumPositions > 0 ? (positionValue / sumPositions) * 100 : 0;
      let valueDisplay: string;
      if (isEthVault) {
        valueDisplay = `${positionValue.toFixed(6)} ${composition.nav.weth ? 'WETH' : 'ETH'}`;
      } else if (isEurcVault) {
        valueDisplay = `${positionValue} EURC`;
      } else {
        valueDisplay = positionValue.toString();
      }
      allocation[position] = {
        percentage: Number(percentage.toFixed(2)),
        value_usdc: valueDisplay
      };
    });
    
    // Check that there is at least one valid position
    if (Object.keys(allocation).length === 0) {
      console.error('No valid positions found in composition data');
      return json(
        { error: 'No valid positions in composition data' },
        { status: 400 }
      );
    }

    const docs = await collection.find({}).sort({ timestamp: -1 }).limit(5).toArray();
    console.log('Top 5 documents triés par timestamp:', docs.map(d => d.timestamp));

    return json({
      compositions: {
        _id: rawComposition._id.toString(),
        timestamp: composition.timestamp,
        total_value_usdc: isEthVault ? `${totalValue} ${composition.nav.weth ? 'WETH' : 'ETH'}` : isEurcVault ? `${totalValue} EURC` : composition.nav.usdc,
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
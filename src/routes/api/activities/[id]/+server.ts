import { json } from '@sveltejs/kit';
import { MongoClient } from 'mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const MONGO_URI = env.MONGO_URI;
if (!MONGO_URI) {
  throw new Error('MONGO_URI environment variable is not set');
}

const client = new MongoClient(MONGO_URI);

// Constants for pagination
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

// Event type mapping
const typeMapping: Record<string, string> = {
  'Deposit': 'depositRequest',
  'Withdraw': 'redeemRequest',
  'Valuation': 'newTotalAssetsUpdated',
  'Settlement': 'settlementRequest'
};

// Function to extract transaction hash from ID
function extractTransactionHashFromId(id: string): string | null {
  // ID format: 0x...hash...000000 or 0x...hash...aa010000
  const match = id.match(/^(0x[a-f0-9]{64})/);
  return match ? match[1] : null;
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    console.log('Starting API request...');
    console.log('Database ID:', params.id);
    console.log('URL params:', Object.fromEntries(url.searchParams.entries()));

    const { id } = params;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || String(DEFAULT_PAGE)));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT))));
    const type = url.searchParams.get('type');

    await client.connect();
    console.log('MongoDB connected successfully');

    const db = client.db(id);
    const collection = db.collection('subgraph');

    // Build base query
    let query: any = {};

    // If a type is specified, add corresponding types
    if (type) {
      // If the type contains a comma, split to get multiple types
      if (type.includes(',')) {
        const types = type.split(',');
        query.type = { $in: types };
      }
      // For deposits, also include deposit settlements
      else if (type === 'depositRequest') {
        query.type = { $in: ['depositRequest', 'settleDeposit'] };
      }
      // For withdrawals, also include redeem settlements
      else if (type === 'redeemRequest') {
        query.type = { $in: ['redeemRequest', 'settleRedeem'] };
      }
      // For other types, keep normal behavior
      else {
        query.type = type;
      }
    }

    console.log('Query:', query);

    // First, list all unique event types for debug
    const uniqueTypes = await collection.distinct('type');
    console.log('Available event types in database:', uniqueTypes);

    // Calculate total number of activities
    const total = await collection.countDocuments(query);

    // Retrieve activities with pagination
    const events = await collection
      .find(query)
      .sort({ blockTimestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    console.log('Raw events:', JSON.stringify(events, null, 2));

    // Transform events to match Activity interface
    const transformedEvents = events.map(event => {
      console.log('Raw event:', event); // Debug log
      return {
        id: event.id,
        owner: event.controller || event.owner,
        type: event.type,
        createdAt: new Date(parseInt(event.blockTimestamp) * 1000).toISOString(),
        amount: event.amount,
        assets: event.assets,
        shares: event.shares || event.amount, // Use amount as fallback for shares
        totalAssets: event.totalAssets,
        sharesBurned: event.sharesBurned,
        sharesMinted: event.sharesMinted,
        totalSupply: event.totalSupply,
        transactionHash: extractTransactionHashFromId(event.id)
      };
    });

    console.log(`Found ${events.length} events for type ${type || 'all'}`);

    return json({
      success: true,
      data: transformedEvents,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return json({
      success: false,
      error: 'Failed to fetch activities'
    }, { status: 500 });
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}; 
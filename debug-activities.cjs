#!/usr/bin/env node

/**
 * Script de debug pour vérifier les activities dans MongoDB
 */

const { MongoClient } = require('mongodb');

async function debugActivities() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI environment variable not set');
    process.exit(1);
  }

  const vaultId = process.argv[2] || 'detrade-core-usdc'; // Default vault
  console.log(`🔍 Debugging activities for vault: ${vaultId}`);

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(vaultId);
    const collection = db.collection('subgraph');

    // Get all unique event types
    const uniqueTypes = await collection.distinct('type');
    console.log('\n📊 Available event types:', uniqueTypes);

    // Get latest 10 events of all types
    console.log('\n🕐 Latest 10 events (all types):');
    const latestEvents = await collection
      .find({})
      .sort({ blockTimestamp: -1 })
      .limit(10)
      .toArray();

    latestEvents.forEach((event, i) => {
      const date = new Date(parseInt(event.blockTimestamp) * 1000);
      console.log(`${i + 1}. ${event.type} - ${date.toISOString()} - ${event.id?.substring(0, 10)}...`);
    });

    // Get latest withdraw requests specifically  
    console.log('\n🔄 Latest 5 withdraw requests:');
    const withdrawEvents = await collection
      .find({ type: 'redeemRequest' })
      .sort({ blockTimestamp: -1 })
      .limit(5)
      .toArray();

    withdrawEvents.forEach((event, i) => {
      const date = new Date(parseInt(event.blockTimestamp) * 1000);
      console.log(`${i + 1}. ${event.type} - ${date.toISOString()} - Controller: ${event.controller} - Amount: ${event.amount}`);
    });

    // Check if there are recent events (last 10 minutes)
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    const recentEvents = await collection
      .find({ blockTimestamp: { $gte: tenMinutesAgo } })
      .sort({ blockTimestamp: -1 })
      .toArray();

    console.log(`\n⏰ Events in last 10 minutes: ${recentEvents.length}`);
    recentEvents.forEach((event, i) => {
      const date = new Date(parseInt(event.blockTimestamp) * 1000);
      console.log(`${i + 1}. ${event.type} - ${date.toISOString()}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

debugActivities().catch(console.error); 
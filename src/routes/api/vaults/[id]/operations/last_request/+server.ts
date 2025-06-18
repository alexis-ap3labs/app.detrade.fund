import { json } from '@sveltejs/kit';
import { ALL_VAULTS } from '$lib/vaults';
import clientPromise from '$lib/mongodb';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getPublicClient, readContract } from '@wagmi/core';
import vaultAbi from '$lib/abi/vault.json';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Cache mémoire pour les requêtes last_request (clé: `${id}_${userAddress}`)
const lastRequestCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 30 * 1000; // 30 secondes

export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { id } = params;
    const userAddress = url.searchParams.get('userAddress');
    
    if (!userAddress) {
      return json({ error: 'User address is required' }, { status: 400 });
    }
    
    const cacheKey = `${id}_${userAddress}`;
    const cached = lastRequestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return json(cached.data);
    }
    
    console.log('Fetching last request IDs for vault:', id, 'user:', userAddress);
    
    // Vérifier si le vault existe
    const vault = ALL_VAULTS.find(v => v.id === id);
    if (!vault) {
      return json({ error: 'Vault not found' }, { status: 404 });
    }

    // Cas spécifique pour detrade-core-usdc : on va chercher on-chain via les fonctions lastDepositRequestId et lastRedeemRequestId
    if (id === 'detrade-core-usdc') {
      try {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.PUBLIC_BASE_RPC)
        });
        // 1. Récupérer le dernier deposit requestId on-chain
        const lastDepositRequestId = await publicClient.readContract({
          address: vault.vaultContract,
          abi: vaultAbi,
          functionName: 'lastDepositRequestId',
          args: [userAddress]
        });
        let lastPendingDepositRequestId = null;
        if (lastDepositRequestId) {
          const pendingAmount = await publicClient.readContract({
            address: vault.vaultContract,
            abi: vaultAbi,
            functionName: 'pendingDepositRequest',
            args: [lastDepositRequestId, userAddress]
          });
          if (BigInt(pendingAmount?.toString?.() ?? String(pendingAmount)) > 0n) {
            lastPendingDepositRequestId = lastDepositRequestId.toString();
          }
        }

        // 2. Récupérer le dernier redeem requestId on-chain
        const lastRedeemRequestId = await publicClient.readContract({
          address: vault.vaultContract,
          abi: vaultAbi,
          functionName: 'lastRedeemRequestId',
          args: [userAddress]
        });
        let lastPendingRedeemRequestId = null;
        if (lastRedeemRequestId) {
          const pendingRedeemAmount = await publicClient.readContract({
            address: vault.vaultContract,
            abi: vaultAbi,
            functionName: 'pendingRedeemRequest',
            args: [lastRedeemRequestId, userAddress]
          });
          if (BigInt(pendingRedeemAmount?.toString?.() ?? String(pendingRedeemAmount)) > 0n) {
            lastPendingRedeemRequestId = lastRedeemRequestId.toString();
          }
        }

        const responseData = {
          lastDepositRequestId: lastPendingDepositRequestId,
          lastRedeemRequestId: lastPendingRedeemRequestId
        };
        lastRequestCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        return json(responseData);
      } catch (err) {
        console.error('Error fetching on-chain last request IDs:', err);
        return json({ error: 'On-chain error', details: String(err) }, { status: 500 });
      }
    }

    // Vérifier l'URI MongoDB
    if (!env.MONGO_URI) {
      return json({ error: 'Database configuration error' }, { status: 500 });
    }

    // Connexion à MongoDB
    const client = await clientPromise;
    const db = client.db(id);
    const collection = db.collection('subgraph');
    
    // Récupérer le dernier deposit request
    const lastDeposit = await collection
      .findOne(
        { 
          type: 'depositRequest',
          controller: userAddress.toLowerCase()
        },
        { sort: { blockTimestamp: -1 } }
      );

    // Récupérer le dernier redeem request
    const lastRedeem = await collection
      .findOne(
        { 
          type: 'redeemRequest',
          controller: userAddress.toLowerCase()
        },
        { sort: { blockTimestamp: -1 } }
      );

    const responseData = {
      lastDepositRequestId: lastDeposit?.requestId || null,
      lastRedeemRequestId: lastRedeem?.requestId || null
    };
    lastRequestCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return json(responseData);
  } catch (error) {
    console.error('Error fetching last request IDs:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}; 
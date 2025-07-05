import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ALL_VAULTS } from '$lib/vaults';

export const load: PageServerLoad = async ({ params, fetch }) => {
    const vaultId = params.id;
    const vault = ALL_VAULTS.find(v => v.id === vaultId);

    if (!vault) {
        throw error(404, 'Vault not found');
    }

    try {
        // Fetch initial vault metrics
        const baseUrl = 'https://app.detrade.fund';
        const [tvlResponse, netAprResponse, thirtyDayAprResponse, sevenDayAprResponse, compositionResponse] = await Promise.all([
            fetch(`${baseUrl}/api/vaults/${vaultId}/metrics/tvl?latest=true`),
            fetch(`${baseUrl}/api/vaults/${vaultId}/metrics/net_apr`),
            fetch(`${baseUrl}/api/vaults/${vaultId}/metrics/30d_apr`),
            fetch(`${baseUrl}/api/vaults/${vaultId}/metrics/7d_apr`),
            fetch(`${baseUrl}/api/vaults/${vaultId}/composition`)
        ]);

        const initialData = {
            tvl: tvlResponse.ok ? await tvlResponse.json() : null,
            netApr: netAprResponse.ok ? await netAprResponse.json() : null,
            thirtyDayApr: thirtyDayAprResponse.ok ? await thirtyDayAprResponse.json() : null,
            sevenDayApr: sevenDayAprResponse.ok ? await sevenDayAprResponse.json() : null,
            composition: compositionResponse.ok ? await compositionResponse.json() : null
        };

        return {
            vault,
            initialData
        };
    } catch (e) {
        console.error('Error loading vault data:', e);
        // Return the vault with null data instead of throwing an error
        return {
            vault,
            initialData: {
                tvl: null,
                netApr: null,
                thirtyDayApr: null,
                sevenDayApr: null,
                composition: null
            }
        };
    }
} 
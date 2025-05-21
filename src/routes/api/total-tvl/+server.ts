import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    try {
        const response = await fetch('https://detrade.fund/api/total-tvl');
        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error in TVL proxy:', error);
        return new Response('Error fetching TVL', { status: 500 });
    }
}; 
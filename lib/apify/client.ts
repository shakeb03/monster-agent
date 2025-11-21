import { ApifyClient } from 'apify-client';

export const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_KEY!,
});


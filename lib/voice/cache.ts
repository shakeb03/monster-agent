import { createAdminClient } from '@/lib/supabase/admin';
import { extractVoiceDNA as extractVoiceDNAFromPosts, getEmergencyVoiceDNA, VoiceDNA } from './dna-extractor';

export type { VoiceDNA } from './dna-extractor';

export async function getCachedVoiceDNA(userId: string): Promise<VoiceDNA | null> {
  const supabase = createAdminClient();

  console.log('[voice-cache] Checking cache for user:', userId);

  const { data } = await supabase
    .from('voice_dna_cache')
    .select('voice_dna, last_updated')
    .eq('user_id', userId)
    .single();

  if (!data) {
    console.log('[voice-cache] No cache found');
    return null;
  }

  // Check if cache is stale (older than 24 hours)
  const lastUpdated = new Date(data.last_updated);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

  if (hoursSinceUpdate > 24) {
    console.log('[voice-cache] Cache is stale (', Math.round(hoursSinceUpdate), 'hours old)');
    return null; // Stale cache
  }

  console.log('[voice-cache] Using cached voice DNA');
  return data.voice_dna as VoiceDNA;
}

export async function saveVoiceDNA(userId: string, voiceDNA: VoiceDNA, postsAnalyzed: number): Promise<void> {
  const supabase = createAdminClient();

  console.log('[voice-cache] Saving voice DNA for user:', userId);

  await supabase
    .from('voice_dna_cache')
    .upsert({
      user_id: userId,
      voice_dna: voiceDNA,
      posts_analyzed: postsAnalyzed,
      last_updated: new Date().toISOString(),
    });

  console.log('[voice-cache] Voice DNA cached successfully');
}

export async function extractVoiceDNA(userId: string): Promise<VoiceDNA> {
  // Try cache first
  const cached = await getCachedVoiceDNA(userId);
  if (cached) {
    console.log('[voice-dna] Using cached voice DNA');
    return cached;
  }

  try {
    // Extract fresh from posts
    console.log('[voice-dna] Extracting fresh voice DNA...');
    const voiceDNA = await extractVoiceDNAFromPosts(userId);
    
    // Validate we got real data
    if (voiceDNA.hookPatterns.length === 0 || voiceDNA.commonPhrases.length === 0) {
      console.warn('[voice-dna] Extraction returned empty data, using emergency DNA');
      return getEmergencyVoiceDNA();
    }
    
    // Save to cache
    await saveVoiceDNA(userId, voiceDNA, 10);
    
    return voiceDNA;
  } catch (error) {
    console.error('[voice-dna] Extraction failed:', error);
    console.log('[voice-dna] Using emergency voice DNA');
    return getEmergencyVoiceDNA();
  }
}

export async function invalidateVoiceDNACache(userId: string): Promise<void> {
  const supabase = createAdminClient();

  console.log('[voice-cache] Invalidating cache for user:', userId);

  await supabase
    .from('voice_dna_cache')
    .delete()
    .eq('user_id', userId);

  console.log('[voice-cache] Cache invalidated');
}

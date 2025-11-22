import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractVoiceDNA } from '@/lib/voice/cache';
import { generateWithEnforcedVoice } from '@/lib/voice/enforced-generator';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[test-voice] === TESTING VOICE SYSTEM ===');
    
    const voiceDNA = await extractVoiceDNA(user.id);
    
    console.log('[test-voice] Voice DNA extracted:', {
      hookPatterns: voiceDNA.hookPatterns.length,
      commonPhrases: voiceDNA.commonPhrases.length,
      neverUses: voiceDNA.neverUses.length,
    });

    // Generate test post
    console.log('[test-voice] Generating test post...');
    const result = await generateWithEnforcedVoice(
      user.id,
      'Mem bridge production issues',
      'failure story'
    );

    return NextResponse.json({
      success: true,
      voiceDNA: {
        hookPatterns: voiceDNA.hookPatterns,
        commonPhrases: voiceDNA.commonPhrases,
        neverUses: voiceDNA.neverUses.slice(0, 10), // First 10
        avgSentenceLength: voiceDNA.avgSentenceLength,
      },
      generated: {
        post: result.post,
        score: result.voiceScore,
        issues: result.issues,
      },
      validation: {
        passed: result.voiceScore >= 7,
        usesSignaturePhrases: voiceDNA.commonPhrases.some((p: string) =>
          result.post.toLowerCase().includes(p.toLowerCase())
        ),
        usesDashes: /^-/m.test(result.post),
        noAsterisks: !/^\*/m.test(result.post),
        hasForbiddenPhrases: voiceDNA.neverUses.some((n: string) =>
          result.post.toLowerCase().includes(n.toLowerCase())
        ),
      },
    });
  } catch (error) {
    console.error('[test-voice] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}


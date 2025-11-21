import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apifyClient } from '@/lib/apify/client';
import { processLinkedInProfile, validateLinkedInUrl, normalizeLinkedInUrl } from '@/lib/apify/processors';
import { withRetry } from '@/lib/apify/retry';
import { handleApifyError } from '@/lib/apify/errors';

export async function POST(req: NextRequest) {
  try {
    console.log('[linkedin-profile] === START ===');
    const { userId } = await auth();
    
    console.log('[linkedin-profile] userId:', userId);
    
    if (!userId) {
      console.log('[linkedin-profile] No userId, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();
    console.log('[linkedin-profile] Received profileUrl:', profileUrl);

    // Validate URL
    console.log('[linkedin-profile] Validating URL...');
    if (!validateLinkedInUrl(profileUrl)) {
      console.log('[linkedin-profile] Invalid URL, returning 400');
      return NextResponse.json(
        { error: 'Invalid LinkedIn profile URL' },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeLinkedInUrl(profileUrl);
    console.log('[linkedin-profile] Normalized URL:', normalizedUrl);

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      console.error('[linkedin-profile] User not found for clerk_user_id:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('[linkedin-profile] Fetching profile for:', normalizedUrl);

    // Fetch with retry logic
    console.log('[linkedin-profile] Calling Apify...');
    const result = await withRetry(
      () => apifyClient.fetchLinkedInProfile(normalizedUrl),
      { maxRetries: 2 }
    );

    console.log('[linkedin-profile] Apify result:', JSON.stringify(result, null, 2));

    if (!result.success || !result.data || result.data.length === 0) {
      console.log('[linkedin-profile] Apify failed or no data, returning 404');
      console.error('[linkedin-profile] Error details:', result.error);
      return NextResponse.json(
        { error: result.error || 'No profile data found' },
        { status: 404 }
      );
    }

    const processedProfile = processLinkedInProfile(result.data[0], normalizedUrl);

    console.log('[linkedin-profile] Profile fetched successfully, saving to DB...');

    // Save to database
    const { data: savedProfile, error: saveError } = await supabase
      .from('linkedin_profiles')
      .upsert({
        user_id: user.id,
        profile_url: normalizedUrl,
        full_name: processedProfile.fullName,
        headline: processedProfile.headline,
        about: processedProfile.about,
        location: processedProfile.location,
        followers_count: processedProfile.followersCount,
        connections_count: processedProfile.connectionsCount,
        profile_image_url: processedProfile.profileImageUrl,
        raw_data: result.data[0],
      })
      .select()
      .single();

    if (saveError) {
      console.error('[linkedin-profile] Error saving profile:', saveError);
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
    }

    console.log('[linkedin-profile] Profile saved, updating user status...');

    const { error: updateError } = await supabase
      .from('users')
      .update({
        linkedin_profile_url: normalizedUrl,
        onboarding_status: 'profile_fetched',
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[linkedin-profile] Error updating user status:', updateError);
    }

    console.log('[linkedin-profile] Success! Profile saved and status updated.');

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch (error) {
    const apifyError = handleApifyError(error);
    console.error('LinkedIn profile fetch error:', apifyError);
    
    return NextResponse.json(
      { error: apifyError.message },
      { status: apifyError.statusCode || 500 }
    );
  }
}


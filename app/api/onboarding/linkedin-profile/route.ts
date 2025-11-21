import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apifyClient } from '@/lib/apify/client';
import { processLinkedInProfile, validateLinkedInUrl, normalizeLinkedInUrl } from '@/lib/apify/processors';
import { withRetry } from '@/lib/apify/retry';
import { handleApifyError } from '@/lib/apify/errors';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    // Validate URL
    if (!validateLinkedInUrl(profileUrl)) {
      return NextResponse.json(
        { error: 'Invalid LinkedIn profile URL' },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeLinkedInUrl(profileUrl);

    const supabase = await createClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch with retry logic
    const result = await withRetry(
      () => apifyClient.fetchLinkedInProfile(normalizedUrl),
      { maxRetries: 2 }
    );

    if (!result.success || !result.data || result.data.length === 0) {
      return NextResponse.json(
        { error: result.error || 'No profile data found' },
        { status: 404 }
      );
    }

    const processedProfile = processLinkedInProfile(result.data[0], normalizedUrl);

    // Save to database
    const { data: savedProfile } = await supabase
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

    await supabase
      .from('users')
      .update({
        linkedin_profile_url: normalizedUrl,
        onboarding_status: 'profile_fetched',
      })
      .eq('id', user.id);

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


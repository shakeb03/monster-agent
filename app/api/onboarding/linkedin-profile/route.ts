import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileUrl }: { profileUrl: string } = await req.json();

    if (!profileUrl) {
      return NextResponse.json({ error: 'Profile URL is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Call Apify LinkedIn Profile API
    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileUrls: [profileUrl],
        }),
      }
    );

    if (!apifyResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch LinkedIn profile' },
        { status: 500 }
      );
    }

    const profileData = await apifyResponse.json();

    if (!profileData || profileData.length === 0) {
      return NextResponse.json(
        { error: 'No profile data found' },
        { status: 404 }
      );
    }

    const profile = profileData[0];

    // Save profile to database
    const { data: savedProfile, error: profileError } = await supabase
      .from('linkedin_profiles')
      .upsert({
        user_id: user.id,
        profile_url: profileUrl,
        full_name: profile.fullName || null,
        headline: profile.headline || null,
        about: profile.about || null,
        location: profile.location || null,
        followers_count: profile.followersCount || 0,
        connections_count: profile.connectionsCount || 0,
        profile_image_url: profile.profilePicture || null,
        raw_data: profile,
      })
      .select()
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      );
    }

    // Update user onboarding status
    await supabase
      .from('users')
      .update({
        linkedin_profile_url: profileUrl,
        onboarding_status: 'profile_fetched',
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch (error) {
    console.error('LinkedIn profile fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


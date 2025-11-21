# 03-APIFY-INTEGRATION.md - Apify Integration

## Step 1: Create Apify Client Utility

Create `lib/apify/client.ts`:

```typescript
interface ApifyRunOptions {
  actorId: string;
  input: Record<string, any>;
  timeout?: number;
}

interface ApifyRunResult {
  success: boolean;
  data?: any[];
  error?: string;
}

export class ApifyClient {
  private apiKey: string;
  private baseUrl = 'https://api.apify.com/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async runActorSync({
    actorId,
    input,
    timeout = 300,
  }: ApifyRunOptions): Promise<ApifyRunResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/acts/${actorId}/run-sync-get-dataset-items?token=${this.apiKey}&timeout=${timeout}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Apify API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        data: Array.isArray(data) ? data : [data],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async fetchLinkedInProfile(profileUrl: string): Promise<ApifyRunResult> {
    return this.runActorSync({
      actorId: 'apimaestro/linkedin-profile-detail',
      input: {
        profileUrls: [profileUrl],
      },
      timeout: 120,
    });
  }

  async fetchLinkedInPosts(
    profileUrl: string,
    maxPosts = 50
  ): Promise<ApifyRunResult> {
    return this.runActorSync({
      actorId: 'supreme_coder/linkedin-post',
      input: {
        profileUrl,
        maxPosts,
      },
      timeout: 300,
    });
  }
}

export const apifyClient = new ApifyClient(process.env.APIFY_API_KEY!);
```

## Step 2: LinkedIn Profile Data Types

Create `types/linkedin.ts`:

```typescript
export interface LinkedInProfileRaw {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  about?: string;
  location?: string;
  followersCount?: number;
  connectionsCount?: number;
  profilePicture?: string;
  backgroundImage?: string;
  publicIdentifier?: string;
  url?: string;
}

export interface LinkedInPostRaw {
  url?: string;
  postUrl?: string;
  text?: string;
  content?: string;
  postedAt?: string;
  timestamp?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  images?: string[];
  video?: string;
  document?: string;
  author?: {
    name?: string;
    profileUrl?: string;
  };
}

export interface ProcessedLinkedInProfile {
  fullName: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  followersCount: number;
  connectionsCount: number;
  profileImageUrl: string | null;
  profileUrl: string;
}

export interface ProcessedLinkedInPost {
  postUrl: string;
  postText: string;
  postedAt: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  engagementRate: number | null;
}
```

## Step 3: Data Processing Utilities

Create `lib/apify/processors.ts`:

```typescript
import {
  LinkedInProfileRaw,
  LinkedInPostRaw,
  ProcessedLinkedInProfile,
  ProcessedLinkedInPost,
} from '@/types/linkedin';

export function processLinkedInProfile(
  raw: LinkedInProfileRaw,
  profileUrl: string
): ProcessedLinkedInProfile {
  return {
    fullName: raw.fullName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || null,
    headline: raw.headline || null,
    about: raw.about || null,
    location: raw.location || null,
    followersCount: raw.followersCount || 0,
    connectionsCount: raw.connectionsCount || 0,
    profileImageUrl: raw.profilePicture || null,
    profileUrl: raw.url || profileUrl,
  };
}

export function processLinkedInPost(raw: LinkedInPostRaw): ProcessedLinkedInPost {
  const postText = raw.text || raw.content || '';
  const postUrl = raw.url || raw.postUrl || '';
  const postedAt = raw.postedAt || raw.timestamp || null;
  
  const likesCount = raw.likes || 0;
  const commentsCount = raw.comments || 0;
  const sharesCount = raw.shares || 0;
  
  // Calculate engagement rate
  const totalEngagement = likesCount + commentsCount + sharesCount;
  const impressions = raw.impressions || 0;
  
  const engagementRate = impressions > 0 
    ? parseFloat(((totalEngagement / impressions) * 100).toFixed(2))
    : null;

  return {
    postUrl,
    postText,
    postedAt,
    likesCount,
    commentsCount,
    sharesCount,
    engagementRate,
  };
}

export function validateLinkedInUrl(url: string): boolean {
  const linkedinUrlPattern = /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9-]+\/?$/;
  return linkedinUrlPattern.test(url);
}

export function normalizeLinkedInUrl(url: string): string {
  // Remove trailing slash
  let normalized = url.trim().replace(/\/$/, '');
  
  // Ensure https protocol
  if (!normalized.startsWith('http')) {
    normalized = `https://${normalized}`;
  }
  
  // Remove query parameters and anchors
  normalized = normalized.split('?')[0].split('#')[0];
  
  return normalized;
}
```

## Step 4: Error Handling for Apify

Create `lib/apify/errors.ts`:

```typescript
export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

export class ApifyTimeoutError extends ApifyError {
  constructor(actorId: string) {
    super(
      `Apify actor ${actorId} timed out`,
      'APIFY_TIMEOUT',
      408
    );
  }
}

export class ApifyRateLimitError extends ApifyError {
  constructor() {
    super(
      'Apify API rate limit exceeded',
      'APIFY_RATE_LIMIT',
      429
    );
  }
}

export class ApifyInvalidInputError extends ApifyError {
  constructor(message: string) {
    super(
      `Invalid input: ${message}`,
      'APIFY_INVALID_INPUT',
      400
    );
  }
}

export function handleApifyError(error: any): ApifyError {
  if (error instanceof ApifyError) {
    return error;
  }

  if (error.response) {
    const status = error.response.status;
    
    if (status === 408 || status === 504) {
      return new ApifyTimeoutError(error.actorId || 'unknown');
    }
    
    if (status === 429) {
      return new ApifyRateLimitError();
    }
    
    if (status === 400) {
      return new ApifyInvalidInputError(error.message);
    }
  }

  return new ApifyError(
    error.message || 'Unknown Apify error',
    'APIFY_UNKNOWN',
    500
  );
}
```

## Step 5: Apify Integration Tests

Create `lib/apify/__tests__/client.test.ts`:

```typescript
import { ApifyClient } from '../client';
import { validateLinkedInUrl, normalizeLinkedInUrl } from '../processors';

describe('ApifyClient', () => {
  let client: ApifyClient;

  beforeEach(() => {
    client = new ApifyClient(process.env.APIFY_API_KEY || 'test-key');
  });

  describe('LinkedIn URL Validation', () => {
    it('should validate correct LinkedIn profile URLs', () => {
      expect(validateLinkedInUrl('https://www.linkedin.com/in/johndoe')).toBe(true);
      expect(validateLinkedInUrl('https://linkedin.com/in/jane-smith')).toBe(true);
      expect(validateLinkedInUrl('http://www.linkedin.com/in/test-user123')).toBe(true);
    });

    it('should reject invalid LinkedIn URLs', () => {
      expect(validateLinkedInUrl('https://twitter.com/johndoe')).toBe(false);
      expect(validateLinkedInUrl('linkedin.com/in/johndoe')).toBe(false);
      expect(validateLinkedInUrl('https://linkedin.com/profile/johndoe')).toBe(false);
    });
  });

  describe('LinkedIn URL Normalization', () => {
    it('should normalize LinkedIn URLs correctly', () => {
      expect(normalizeLinkedInUrl('linkedin.com/in/johndoe/')).toBe(
        'https://linkedin.com/in/johndoe'
      );
      expect(normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe?trk=123')).toBe(
        'https://www.linkedin.com/in/johndoe'
      );
      expect(normalizeLinkedInUrl('http://linkedin.com/in/johndoe#profile')).toBe(
        'https://linkedin.com/in/johndoe'
      );
    });
  });
});
```

## Step 6: Retry Logic for Apify Calls

Create `lib/apify/retry.ts`:

```typescript
interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        break;
      }

      // Don't retry on 4xx errors (except 429)
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
      ) {
        const statusCode = error.statusCode;
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw error;
        }
      }

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}
```

## Step 7: Usage Example in API Route

Update the LinkedIn profile route to use the new utilities:

```typescript
// In app/api/onboarding/linkedin-profile/route.ts

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
```

## Next Steps

Proceed to `04-OPENAI-INTEGRATION.md` for OpenAI setup and chat implementation.
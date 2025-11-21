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
      // Apify API uses ~ instead of / in actor IDs for URLs
      const actorIdForUrl = actorId.replace('/', '~');
      
      const response = await fetch(
        `${this.baseUrl}/acts/${actorIdForUrl}/run-sync-get-dataset-items?token=${this.apiKey}&timeout=${timeout}`,
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
        includeEmail: false,
        username: profileUrl,
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
        deepScrape: true,
        limitPerSource: maxPosts,
        rawData: false,
        urls: [profileUrl],
      },
      timeout: 300,
    });
  }
}

export const apifyClient = new ApifyClient(process.env.APIFY_API_KEY!);


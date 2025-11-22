import {
  ProcessedLinkedInProfile,
  ProcessedLinkedInPost,
} from '@/types/linkedin';

export function processLinkedInProfile(
  raw: any,
  profileUrl: string
): ProcessedLinkedInProfile {
  // Apify returns data nested under 'basic_info'
  const basicInfo = raw.basic_info || raw;
  
  return {
    fullName: basicInfo.fullname || basicInfo.fullName || 
              `${basicInfo.first_name || basicInfo.firstName || ''} ${basicInfo.last_name || basicInfo.lastName || ''}`.trim() || null,
    headline: basicInfo.headline || null,
    about: basicInfo.about || null,
    location: typeof basicInfo.location === 'string' 
      ? basicInfo.location 
      : (basicInfo.location?.full || basicInfo.location?.city || null),
    followersCount: basicInfo.follower_count || basicInfo.followersCount || 0,
    connectionsCount: basicInfo.connection_count || basicInfo.connectionsCount || 0,
    profileImageUrl: basicInfo.profile_picture_url || basicInfo.profilePicture || null,
    profileUrl: basicInfo.profile_url || basicInfo.url || profileUrl,
  };
}

export function processLinkedInPost(raw: any): ProcessedLinkedInPost {
  // Handle various field name variations from Apify
  const postText = raw.text || raw.commentary || raw.content || raw.description || '';
  const postUrl = raw.url || raw.postUrl || raw.post_url || raw.link || '';
  const postedAt = raw.postedAt || raw.posted_at || raw.publishedAt || raw.published_at || 
                   raw.timestamp || raw.date || null;
  
  // Helper function to extract count from either a number or an array
  const extractCount = (value: any): number => {
    if (typeof value === 'number') return value;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  };
  
  const likesCount = extractCount(raw.likes || raw.numLikes || raw.num_likes || raw.likesCount || raw.reactionCount);
  const commentsCount = extractCount(raw.comments || raw.numComments || raw.num_comments || raw.commentsCount);
  const sharesCount = extractCount(raw.shares || raw.numShares || raw.num_shares || raw.sharesCount || 
                                   raw.repostsCount || raw.reposts);
  
  // Calculate engagement rate
  const totalEngagement = likesCount + commentsCount + sharesCount;
  const impressions = raw.impressions || raw.views || 0;
  
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

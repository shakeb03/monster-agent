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


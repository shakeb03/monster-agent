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


'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, MessageSquare, Share2, Heart } from 'lucide-react';
import { truncateText } from '@/lib/utils';

interface Post {
  id: string;
  post_text: string;
  post_url: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  engagement_rate: number | null;
  post_analysis?: {
    tone: string;
    what_worked: string;
  };
}

interface TopPostsProps {
  posts: Post[];
}

export default function TopPosts({ posts }: TopPostsProps) {
  if (!posts || posts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No posts available yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post, index) => (
        <Card key={post.id} className="relative overflow-hidden">
          {/* Rank Badge */}
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="font-bold">
              #{index + 1}
            </Badge>
          </div>

          <CardContent className="pt-6">
            {/* Post Text */}
            <p className="text-sm mb-4 line-clamp-4">{post.post_text}</p>

            {/* Engagement Metrics */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Heart className="h-3 w-3" />
                <span>{post.likes_count}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                <span>{post.comments_count}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Share2 className="h-3 w-3" />
                <span>{post.shares_count}</span>
              </div>
              {post.engagement_rate && (
                <div className="flex items-center gap-1 text-xs text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>{post.engagement_rate}%</span>
                </div>
              )}
            </div>

            {/* Analysis Insights */}
            {post.post_analysis && (
              <div className="space-y-2 pt-2 border-t border-border">
                {post.post_analysis.tone && (
                  <div>
                    <p className="text-xs font-medium">Tone</p>
                    <Badge variant="outline" className="mt-1">
                      {post.post_analysis.tone}
                    </Badge>
                  </div>
                )}
                {post.post_analysis.what_worked && (
                  <div>
                    <p className="text-xs font-medium mb-1">What Worked</p>
                    <p className="text-xs text-muted-foreground">
                      {truncateText(post.post_analysis.what_worked, 120)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* View on LinkedIn */}
            <a
              href={post.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              View on LinkedIn →
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

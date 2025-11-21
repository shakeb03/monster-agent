# 10-ANALYSIS-DISPLAY.md - Analysis Panel Implementation

## Step 1: Create Main Analysis Panel Component

Create `components/analysis/analysis-panel.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnalysis } from '@/hooks/use-analysis';
import VoiceAnalysis from './voice-analysis';
import TopPosts from './top-posts';
import MetricsDisplay from './metrics-display';

interface AnalysisPanelProps {
  userId: string;
}

export default function AnalysisPanel({ userId }: AnalysisPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data, isLoading, error } = useAnalysis(userId);

  if (isCollapsed) {
    return (
      <div className="border-l border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="m-2"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analysis</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">{error}</p>
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            No analysis data available yet
          </p>
        </div>
      ) : (
        <Tabs defaultValue="voice" className="flex-1 flex flex-col">
          <TabsList className="w-full grid grid-cols-3 mx-4 mt-2">
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="posts">Top Posts</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 p-4">
            <TabsContent value="voice" className="mt-0">
              <VoiceAnalysis data={data.voiceAnalysis} />
            </TabsContent>

            <TabsContent value="posts" className="mt-0">
              <TopPosts posts={data.topPosts} />
            </TabsContent>

            <TabsContent value="metrics" className="mt-0">
              <MetricsDisplay stats={data.postingStats} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      )}
    </div>
  );
}
```

## Step 2: Create Voice Analysis Component

Create `components/analysis/voice-analysis.tsx`:

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface VoiceAnalysisProps {
  data: {
    overall_tone: string | null;
    writing_style: string | null;
    common_topics: string[];
    strengths: string[];
    weaknesses: string[];
    top_performing_elements: string[];
    recommendations: string[];
    analysis_summary: string | null;
  } | null;
}

export default function VoiceAnalysis({ data }: VoiceAnalysisProps) {
  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">
        No voice analysis available yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.analysis_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.analysis_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Tone & Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tone & Style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.overall_tone && (
            <div>
              <p className="text-xs font-medium mb-1">Tone</p>
              <Badge variant="secondary">{data.overall_tone}</Badge>
            </div>
          )}
          {data.writing_style && (
            <div>
              <p className="text-xs font-medium mb-1">Style</p>
              <p className="text-sm text-muted-foreground">{data.writing_style}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topics */}
      {data.common_topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Common Topics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.common_topics.map((topic, i) => (
                <Badge key={i} variant="outline">
                  {topic}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {data.strengths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.strengths.map((strength, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  {strength}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Areas for Improvement */}
      {data.weaknesses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Areas for Improvement</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.weaknesses.map((weakness, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="text-yellow-500 mr-2">•</span>
                  {weakness}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Top Performing Elements */}
      {data.top_performing_elements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What Works Best</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.top_performing_elements.map((element, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="mr-2">🎯</span>
                  {element}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="mr-2">💡</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

## Step 3: Create Top Posts Component

Create `components/analysis/top-posts.tsx`:

```typescript
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
```

## Step 4: Create Metrics Display Component

Create `components/analysis/metrics-display.tsx`:

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, FileText, BarChart3 } from 'lucide-react';

interface MetricsDisplayProps {
  stats: {
    totalPosts: number;
    averageEngagement: string;
  };
}

export default function MetricsDisplay({ stats }: MetricsDisplayProps) {
  return (
    <div className="space-y-4">
      {/* Total Posts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Total Posts Analyzed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.totalPosts}</p>
        </CardContent>
      </Card>

      {/* Average Engagement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Average Engagement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.averageEngagement}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            Across all analyzed posts
          </p>
        </CardContent>
      </Card>

      {/* Engagement Benchmark */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {parseFloat(stats.averageEngagement) > 5 ? (
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-3 w-3 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Great engagement!</p>
                <p className="text-xs text-muted-foreground">
                  Your posts perform above average
                </p>
              </div>
            </div>
          ) : parseFloat(stats.averageEngagement) > 2 ? (
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-3 w-3 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Solid performance</p>
                <p className="text-xs text-muted-foreground">
                  Room for optimization
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-3 w-3 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Growth opportunity</p>
                <p className="text-xs text-muted-foreground">
                  Let's optimize your content
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Posts analyzed</span>
            <span className="font-medium">{stats.totalPosts}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Avg. engagement</span>
            <span className="font-medium">{stats.averageEngagement}%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Step 5: Add Required shadcn Components

Install missing components:

```bash
npx shadcn-ui@latest add tabs badge card
```

## Step 6: Create Analysis Types

Create `types/analysis.ts`:

```typescript
export interface VoiceAnalysisData {
  overall_tone: string | null;
  writing_style: string | null;
  common_topics: string[];
  posting_patterns: any;
  engagement_patterns: any;
  strengths: string[];
  weaknesses: string[];
  top_performing_elements: string[];
  recommendations: string[];
  analysis_summary: string | null;
}

export interface PostWithAnalysis {
  id: string;
  post_text: string;
  post_url: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  engagement_rate: number | null;
  post_analysis?: {
    tone: string;
    topics: string[];
    hook_analysis: string;
    engagement_analysis: string;
    what_worked: string;
    what_didnt_work: string;
  };
}

export interface PostingStats {
  totalPosts: number;
  averageEngagement: string;
}

export interface AnalysisData {
  voiceAnalysis: VoiceAnalysisData | null;
  topPosts: PostWithAnalysis[];
  postingStats: PostingStats;
}
```

## Step 7: Create Analysis Refresh Utility

Create `lib/analysis/refresh.ts`:

```typescript
export async function refreshAnalysis(userId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/analysis/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to refresh analysis:', error);
    return false;
  }
}
```

## Step 8: Create Empty State Component

Create `components/analysis/empty-state.tsx`:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { BarChart3 } from 'lucide-react';

interface EmptyStateProps {
  onRefresh?: () => void;
}

export default function EmptyState({ onRefresh }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <BarChart3 className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No analysis yet</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Complete onboarding to see your LinkedIn content analysis
      </p>
      {onRefresh && (
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh Analysis
        </Button>
      )}
    </div>
  );
}
```


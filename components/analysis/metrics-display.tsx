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
                  Let&apos;s optimize your content
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

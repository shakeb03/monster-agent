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
    <div className="w-80 border-l border-border flex flex-col h-screen bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
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
        <Tabs defaultValue="voice" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 mx-4 my-3 flex-shrink-0">
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="posts">Top Posts</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="px-4 pb-4">
              <TabsContent value="voice" className="mt-0 space-y-4">
                <VoiceAnalysis data={data.voiceAnalysis} />
              </TabsContent>

              <TabsContent value="posts" className="mt-0 space-y-4">
                <TopPosts posts={data.topPosts} />
              </TabsContent>

              <TabsContent value="metrics" className="mt-0 space-y-4">
                <MetricsDisplay stats={data.postingStats} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      )}
    </div>
  );
}

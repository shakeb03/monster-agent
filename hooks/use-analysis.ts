'use client';

import { useState, useEffect } from 'react';

interface AnalysisData {
  voiceAnalysis: any;
  topPosts: any[];
  postingStats: {
    totalPosts: number;
    averageEngagement: string;
  };
}

export function useAnalysis(userId: string) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const response = await fetch('/api/analysis');
        
        if (!response.ok) {
          throw new Error('Failed to fetch analysis');
        }

        const analysisData = await response.json();
        setData(analysisData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    if (userId) {
      fetchAnalysis();
    }
  }, [userId]);

  return { data, isLoading, error };
}


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


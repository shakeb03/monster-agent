'use client';

import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface OnboardingErrorProps {
  message: string;
  onRetry: () => void;
}

export default function OnboardingError({ message, onRetry }: OnboardingErrorProps) {
  return (
    <div className="text-center space-y-4">
      <div className="h-12 w-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onRetry}>Try Again</Button>
    </div>
  );
}


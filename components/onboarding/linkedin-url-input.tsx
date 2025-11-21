'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateLinkedInUrl } from '@/lib/apify/processors';

interface LinkedInUrlInputProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export default function LinkedInUrlInput({
  onSubmit,
  isLoading = false,
}: LinkedInUrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter your LinkedIn profile URL');
      return;
    }

    if (!validateLinkedInUrl(url)) {
      setError('Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)');
      return;
    }

    setError('');
    onSubmit(url.trim());
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Welcome! Let's get started</h1>
        <p className="text-muted-foreground">
          First, we need to analyze your LinkedIn profile and content to understand your unique voice.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="linkedin-url" className="text-sm font-medium">
            Enter your LinkedIn profile URL
          </label>
          <Input
            id="linkedin-url"
            type="url"
            placeholder="https://linkedin.com/in/yourname"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="text-lg"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
          <p className="text-sm font-medium">What we'll analyze:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Your recent LinkedIn posts</li>
            <li>• Your writing style and tone</li>
            <li>• What content performs best for you</li>
            <li>• Your engagement patterns</li>
          </ul>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Analyzing...' : 'Continue'}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        We only read public information from your LinkedIn profile. Your data is secure and private.
      </p>
    </div>
  );
}

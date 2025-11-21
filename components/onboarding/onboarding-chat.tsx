'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import LinkedInUrlInput from './linkedin-url-input';
import GoalsInput from './goals-input';
import ProgressIndicator from './progress-indicator';
import { useToast } from '@/components/ui/use-toast';

type OnboardingStep = 'linkedin_url' | 'fetching_data' | 'goals' | 'analyzing' | 'completed';

interface OnboardingChatProps {
  user: any;
}

export default function OnboardingChat({ user }: OnboardingChatProps) {
  const [step, setStep] = useState<OnboardingStep>('linkedin_url');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const progressSteps = [
    {
      id: 'profile',
      label: 'Profile',
      completed: ['fetching_data', 'goals', 'analyzing', 'completed'].includes(step),
      active: step === 'linkedin_url' || step === 'fetching_data',
    },
    {
      id: 'goals',
      label: 'Goals',
      completed: ['analyzing', 'completed'].includes(step),
      active: step === 'goals',
    },
    {
      id: 'analysis',
      label: 'Analysis',
      completed: step === 'completed',
      active: step === 'analyzing',
    },
  ];

  async function handleLinkedInSubmit(url: string) {
    setLinkedInUrl(url);
    setIsLoading(true);
    setStep('fetching_data');

    try {
      // Fetch LinkedIn profile
      const profileResponse = await fetch('/api/onboarding/linkedin-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: url }),
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch LinkedIn profile');
      }

      // Fetch LinkedIn posts
      const postsResponse = await fetch('/api/onboarding/linkedin-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: url }),
      });

      if (!postsResponse.ok) {
        throw new Error('Failed to fetch LinkedIn posts');
      }

      // Move to goals step
      setStep('goals');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setStep('linkedin_url');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoalsSubmit(goals: string[]) {
    setIsLoading(true);
    setStep('analyzing');

    try {
      // Save goals
      const goalsResponse = await fetch('/api/onboarding/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals }),
      });

      if (!goalsResponse.ok) {
        throw new Error('Failed to save goals');
      }

      // Analyze posts
      const analysisResponse = await fetch('/api/onboarding/analyze-posts', {
        method: 'POST',
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze posts');
      }

      toast({
        title: 'Success',
        description: 'Your profile has been analyzed!',
      });

      setStep('completed');
      
      // Redirect to chat after a brief delay
      setTimeout(() => {
        router.push('/chat');
        router.refresh();
      }, 1500);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setStep('goals');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <ProgressIndicator steps={progressSteps} />
        {step === 'linkedin_url' && (
          <LinkedInUrlInput
            onSubmit={handleLinkedInSubmit}
            isLoading={isLoading}
          />
        )}

        {step === 'fetching_data' && (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <h2 className="text-2xl font-bold mb-2">Fetching your LinkedIn data</h2>
              <p className="text-muted-foreground">
                We're gathering your profile and recent posts. This may take a minute...
              </p>
            </div>
          </div>
        )}

        {step === 'goals' && (
          <GoalsInput onSubmit={handleGoalsSubmit} isLoading={isLoading} />
        )}

        {step === 'analyzing' && (
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <h2 className="text-2xl font-bold mb-2">Analyzing your content</h2>
              <p className="text-muted-foreground">
                We're analyzing your writing style, voice, and what works best for you...
              </p>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div className="text-center space-y-4">
            <div className="h-12 w-12 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-green-500"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">All set!</h2>
              <p className="text-muted-foreground">
                Your profile is ready. Redirecting to chat...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

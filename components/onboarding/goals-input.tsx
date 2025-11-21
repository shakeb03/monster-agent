'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

const GOAL_OPTIONS = [
  { id: 'followers', label: 'Grow my follower count' },
  { id: 'engagement', label: 'Increase post engagement' },
  { id: 'thought_leadership', label: 'Build thought leadership' },
  { id: 'networking', label: 'Expand my professional network' },
  { id: 'brand', label: 'Strengthen my personal brand' },
  { id: 'leads', label: 'Generate leads or opportunities' },
];

interface GoalsInputProps {
  onSubmit: (goals: string[]) => void;
  isLoading?: boolean;
}

export default function GoalsInput({
  onSubmit,
  isLoading = false,
}: GoalsInputProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');

  function toggleGoal(goalId: string) {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((g) => g !== goalId)
        : [...prev, goalId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const goals = [
      ...selectedGoals.map((id) => GOAL_OPTIONS.find((g) => g.id === id)?.label || ''),
      ...(customGoal.trim() ? [customGoal.trim()] : []),
    ].filter(Boolean);

    onSubmit(goals);
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">What are your LinkedIn goals?</h2>
        <p className="text-muted-foreground">
          Select all that apply. This helps us tailor content to your objectives.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          {GOAL_OPTIONS.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <Checkbox
                id={goal.id}
                checked={selectedGoals.includes(goal.id)}
                onCheckedChange={() => toggleGoal(goal.id)}
              />
              <label
                htmlFor={goal.id}
                className="flex-1 text-sm font-medium cursor-pointer"
                onClick={() => toggleGoal(goal.id)}
              >
                {goal.label}
              </label>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="custom-goal" className="text-sm font-medium">
            Other goals (optional)
          </label>
          <Textarea
            id="custom-goal"
            placeholder="Describe any other goals you have for LinkedIn..."
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            disabled={isLoading}
            rows={3}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isLoading || (selectedGoals.length === 0 && !customGoal.trim())}
        >
          {isLoading ? 'Processing...' : 'Continue'}
        </Button>
      </form>
    </div>
  );
}


'use client';

import { UserButton, useUser } from '@clerk/nextjs';

export function UserProfile() {
  const { user } = useUser();

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <UserButton afterSignOutUrl="/sign-in" />
      {user && (
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {user.primaryEmailAddress?.emailAddress || 'User'}
          </span>
          <span className="text-xs text-muted-foreground">
            Signed in
          </span>
        </div>
      )}
    </div>
  );
}


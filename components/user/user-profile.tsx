'use client';

import { UserButton } from '@clerk/nextjs';
import { useUser } from '@/components/providers/user-provider';

export function UserProfile() {
  const { user } = useUser();

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <UserButton afterSignOutUrl="/sign-in" />
      {user && (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{user.email}</span>
          {user.linkedin_profile_url && (
            <span className="text-xs text-muted-foreground">
              Profile connected
            </span>
          )}
        </div>
      )}
    </div>
  );
}


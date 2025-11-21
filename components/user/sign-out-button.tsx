'use client';

import { useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const { signOut } = useClerk();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut()}
      className="w-full justify-start"
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}


import { currentUser } from '@clerk/nextjs/server';

type ClerkUserLike = {
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
  primaryEmailAddressId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

export async function getCurrentClerkUser() {
  try {
    const user = await currentUser();
    return user;
  } catch (error) {
    console.error('Error fetching Clerk user:', error);
    return null;
  }
}

export function getEmailFromClerkUser(user: ClerkUserLike | null | undefined): string | null {
  const primaryEmail = user?.emailAddresses?.find(
    (email) => email.id === user.primaryEmailAddressId
  );

  return primaryEmail?.emailAddress || null;
}

export function getUserDisplayName(user: ClerkUserLike | null | undefined): string {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  if (user?.firstName) {
    return user.firstName;
  }

  if (user?.username) {
    return user.username;
  }

  return getEmailFromClerkUser(user) || 'User';
}

import { currentUser } from '@clerk/nextjs';

export async function getCurrentClerkUser() {
  try {
    const user = await currentUser();
    return user;
  } catch (error) {
    console.error('Error fetching Clerk user:', error);
    return null;
  }
}

export function getEmailFromClerkUser(user: any): string | null {
  const primaryEmail = user?.emailAddresses.find(
    (e: any) => e.id === user.primaryEmailAddressId
  );

  return primaryEmail?.emailAddress || null;
}

export function getUserDisplayName(user: any): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  if (user.firstName) {
    return user.firstName;
  }

  if (user.username) {
    return user.username;
  }

  return getEmailFromClerkUser(user) || 'User';
}


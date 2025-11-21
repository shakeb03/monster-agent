export async function refreshAnalysis(userId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/analysis/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to refresh analysis:', error);
    return false;
  }
}


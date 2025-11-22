import { buildSemanticContext } from './semantic-context';
import type { SemanticContext } from './semantic-context';

interface CachedContext {
  context: SemanticContext;
  timestamp: number;
}

// Cache semantic context to avoid rebuilding every time
const contextCache = new Map<string, CachedContext>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getCachedSemanticContext(userId: string): Promise<SemanticContext> {
  const cached = contextCache.get(userId);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log('[context-cache] Using cached context for user:', userId);
    return cached.context;
  }

  console.log('[context-cache] Building fresh context for user:', userId);

  // Rebuild context
  const context = await buildSemanticContext(userId);
  contextCache.set(userId, { context, timestamp: now });

  return context;
}

export function invalidateContextCache(userId: string): void {
  console.log('[context-cache] Invalidating cache for user:', userId);
  contextCache.delete(userId);
}

export function getCacheStats(): { size: number; users: string[] } {
  return {
    size: contextCache.size,
    users: Array.from(contextCache.keys()),
  };
}

import { getChatTokenCount, getLongContextTokenCount } from './utils';
import type { ContextMetrics } from '@/types/context';

const MAX_CONTEXT_TOKENS = 200000;
const SUMMARIZATION_THRESHOLD = 180000;

export async function getContextMetrics(
  chatId: string,
  userId: string
): Promise<ContextMetrics> {
  const chatTokens = await getChatTokenCount(chatId);
  const longContextTokens = await getLongContextTokenCount(userId);
  
  const currentTokens = chatTokens + longContextTokens;
  const utilizationPercentage = (currentTokens / MAX_CONTEXT_TOKENS) * 100;
  const needsSummarization = currentTokens >= SUMMARIZATION_THRESHOLD;

  return {
    currentTokens,
    maxTokens: MAX_CONTEXT_TOKENS,
    utilizationPercentage: parseFloat(utilizationPercentage.toFixed(2)),
    needsSummarization,
  };
}

export function getContextHealthStatus(
  metrics: ContextMetrics
): 'healthy' | 'warning' | 'critical' {
  if (metrics.utilizationPercentage < 75) {
    return 'healthy';
  } else if (metrics.utilizationPercentage < 90) {
    return 'warning';
  } else {
    return 'critical';
  }
}


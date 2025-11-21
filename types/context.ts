export interface ContextSummary {
  id: string;
  chatId: string;
  userId: string;
  summaryText: string;
  messagesIncluded: number;
  tokenCount: number;
  summaryType: 'batch' | 'auto_compress';
  createdAt: string;
}

export interface LongContext {
  id: string;
  userId: string;
  contextText: string;
  totalTokens: number;
  lastUpdated: string;
  createdAt: string;
}

export interface ContextMetrics {
  currentTokens: number;
  maxTokens: number;
  utilizationPercentage: number;
  needsSummarization: boolean;
}


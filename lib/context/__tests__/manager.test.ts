import { shouldTriggerBatchSummarization } from '../utils';
import { estimateTokenCount, shouldSummarizeBasedOnTokens } from '@/lib/openai/tokens';

describe('Context Management', () => {
  describe('Batch Summarization Trigger', () => {
    it('should trigger every 10 messages', () => {
      expect(shouldTriggerBatchSummarization(10)).toBe(true);
      expect(shouldTriggerBatchSummarization(20)).toBe(true);
      expect(shouldTriggerBatchSummarization(30)).toBe(true);
      
      expect(shouldTriggerBatchSummarization(5)).toBe(false);
      expect(shouldTriggerBatchSummarization(15)).toBe(false);
    });
  });

  describe('Token Counting', () => {
    it('should estimate tokens correctly', () => {
      const shortText = 'Hello world';
      const tokens = estimateTokenCount(shortText);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should detect when summarization is needed', () => {
      expect(shouldSummarizeBasedOnTokens(180000)).toBe(true);
      expect(shouldSummarizeBasedOnTokens(200000)).toBe(true);
      expect(shouldSummarizeBasedOnTokens(100000)).toBe(false);
    });
  });
});


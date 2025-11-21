export function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function estimateTokensFromMessages(
  messages: Array<{ role: string; content: string }>
): number {
  let totalTokens = 0;

  for (const message of messages) {
    // Each message has overhead: role (1 token) + content + formatting (~3 tokens)
    totalTokens += 4;
    totalTokens += estimateTokenCount(message.content);
  }

  // Additional overhead for the message array
  totalTokens += 3;

  return totalTokens;
}

export function shouldSummarizeBasedOnTokens(tokenCount: number): boolean {
  return tokenCount >= 180000; // 180k tokens, leaving buffer before 200k limit
}


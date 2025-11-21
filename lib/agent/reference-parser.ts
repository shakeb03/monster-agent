export function parseVariationReference(
  userMessage: string,
  previousResponse: string
): string | null {
  const lowerMessage = userMessage.toLowerCase();

  // Check for variation references
  const variationMatch = lowerMessage.match(/variation\s+(\d+|one|two|three|first|second|third)/i);
  
  if (!variationMatch) {
    return null;
  }

  const variationNumber = parseVariationNumber(variationMatch[1]);

  // Extract variation from previous response
  const variations = previousResponse.split('### Variation');
  
  if (variationNumber && variationNumber <= variations.length - 1) {
    // Return just the post content without metadata
    return variations[variationNumber].split('**Patterns used:**')[0].trim();
  }

  return null;
}

function parseVariationNumber(str: string): number | null {
  const map: Record<string, number> = {
    '1': 1, 'one': 1, 'first': 1,
    '2': 2, 'two': 2, 'second': 2,
    '3': 3, 'three': 3, 'third': 3,
  };
  
  return map[str.toLowerCase()] || null;
}

export function detectReference(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase();
  
  const referencePatterns = [
    /variation\s+(\d+|one|two|three|first|second|third)/i,
    /(the\s+)?(first|second|third|last)\s+(one|post|variation)/i,
    /that\s+(post|one|variation)/i,
    /this\s+(post|one|variation)/i,
    /improve\s+(it|that|this)/i,
    /make\s+(it|that|this)/i,
    /shorten\s+(it|that|this)/i,
    /expand\s+(it|that|this)/i,
  ];
  
  return referencePatterns.some(pattern => pattern.test(lowerMessage));
}

export function extractFullVariation(
  previousResponse: string,
  variationNumber: number
): string | null {
  const variations = previousResponse.split('### Variation');
  
  if (variationNumber && variationNumber <= variations.length - 1) {
    // Get the full variation including metadata
    const variationText = variations[variationNumber];
    
    // Find where the next variation starts or where recommendation starts
    const nextSectionIndex = Math.min(
      variationText.indexOf('### Variation', 1) !== -1 
        ? variationText.indexOf('### Variation', 1) 
        : variationText.length,
      variationText.indexOf('### Recommendation') !== -1
        ? variationText.indexOf('### Recommendation')
        : variationText.length
    );
    
    return variationText.substring(0, nextSectionIndex).trim();
  }
  
  return null;
}


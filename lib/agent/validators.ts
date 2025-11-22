interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGenerationContext(context: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if context has successful data (not just error results)
  const voice = context.profile?.data?.voice || context.voice?.data;
  const topPosts = context.topPosts?.data;
  const patterns = context.patterns?.data?.patterns;

  // Required: Voice analysis
  if (!voice) {
    errors.push('Missing voice analysis - cannot generate authentic content');
  } else {
    if (!voice.overall_tone) warnings.push('No tone data');
    if (!voice.writing_style) warnings.push('No writing style data');
    if (!voice.common_topics || voice.common_topics.length === 0) {
      warnings.push('No topic data');
    }
  }

  // Required: Top posts for examples
  if (!topPosts || topPosts.length === 0) {
    errors.push('No example posts - cannot understand writing style');
  } else if (topPosts.length < 3) {
    warnings.push('Only ' + topPosts.length + ' example posts - limited data');
  }

  // Required: Viral patterns
  if (!patterns || patterns.length === 0) {
    errors.push('No viral patterns - cannot ensure high engagement');
  } else if (patterns.length < 3) {
    warnings.push('Limited pattern data (' + patterns.length + ')');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Generic phrases that indicate non-authentic content
const GENERIC_PHRASES = [
  'in the ever-evolving world of',
  'as a [role] passionate about',
  'key takeaways:',
  'questions to ponder:',
  'let\'s dive in',
  'i\'ve been thinking about',
  'in today\'s fast-paced',
  'the landscape of',
  'thrilled to announce',
  'excited to share',
];

export function containsGenericPhrases(content: string): string[] {
  const found: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const phrase of GENERIC_PHRASES) {
    if (lowerContent.includes(phrase)) {
      found.push(phrase);
    }
  }
  
  return found;
}


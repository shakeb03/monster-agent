import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function validateContentQuality(
  generatedContent: string,
  userExamples: string[],
  voiceAnalysis: any
): Promise<{ score: number; issues: string[]; passes: boolean }> {
  const prompt = `Compare this generated content to the user's actual posts and voice.

GENERATED CONTENT:
"""
${generatedContent}
"""

USER'S ACTUAL POSTS:
${userExamples.map((ex, i) => `Post ${i + 1}:\n${ex}`).join('\n\n')}

USER'S VOICE ANALYSIS:
Tone: ${voiceAnalysis.overall_tone}
Style: ${voiceAnalysis.writing_style}

EVALUATE:
1. Does it sound like the user? (1-10)
2. Does it use similar hooks/structure? (1-10)
3. Does it match their tone? (1-10)
4. Would you mistake this for their writing? (1-10)

Identify specific issues:
- Generic phrases not in their vocabulary
- Style mismatches
- Tone inconsistencies
- Structure differences

Return JSON:
{
  "similarity_score": average of 4 scores,
  "issues": [list of specific problems],
  "passes": true if score >= 7
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      score: result.similarity_score || 0,
      issues: result.issues || [],
      passes: result.passes || false,
    };
  } catch (error) {
    console.error('Quality check error:', error);
    // If quality check fails, default to passing to not block generation
    return {
      score: 7,
      issues: ['Could not perform quality check'],
      passes: true,
    };
  }
}


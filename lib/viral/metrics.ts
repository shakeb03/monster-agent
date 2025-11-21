import { createAdminClient } from '@/lib/supabase/admin';

interface ViralMetrics {
  avgEngagement: string;
  viralPercentage: string;
  consistency: string;
  totalPosts: number;
}

export async function trackViralMetrics(userId: string): Promise<ViralMetrics | null> {
  const supabase = createAdminClient();

  const { data: performance } = await supabase
    .from('post_performance')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!performance || performance.length === 0) return null;

  const avgEngagement =
    performance.reduce((sum, p) => sum + (p.actual_engagement || 0), 0) /
    performance.length;

  const viralPosts = performance.filter(
    p => p.actual_engagement && p.actual_engagement > avgEngagement * 2
  ).length;

  const consistency =
    1 - calculateStandardDeviation(performance.map(p => p.actual_engagement || 0));

  return {
    avgEngagement: avgEngagement.toFixed(2),
    viralPercentage: ((viralPosts / performance.length) * 100).toFixed(1),
    consistency: (consistency * 100).toFixed(1),
    totalPosts: performance.length,
  };
}

function calculateStandardDeviation(values: number[]): number {
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  const avgSquareDiff =
    squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff) / avg; // Coefficient of variation
}

// Get pattern performance metrics
export async function getPatternPerformance(userId: string) {
  const supabase = createAdminClient();

  const { data: patterns } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false });

  if (!patterns) return null;

  const byType = patterns.reduce((acc, pattern) => {
    if (!acc[pattern.pattern_type]) {
      acc[pattern.pattern_type] = [];
    }
    acc[pattern.pattern_type].push(pattern);
    return acc;
  }, {} as Record<string, any[]>);

  return {
    totalPatterns: patterns.length,
    byType,
    topPerformers: patterns.slice(0, 5),
    avgSuccessRate: (
      patterns.reduce((sum, p) => sum + (p.success_rate || 0), 0) / patterns.length
    ).toFixed(2),
  };
}

// Track pattern usage and update metrics
export async function updatePatternUsage(
  patternId: string,
  engagement: number
): Promise<void> {
  const supabase = createAdminClient();

  const { data: pattern } = await supabase
    .from('viral_patterns')
    .select('*')
    .eq('id', patternId)
    .single();

  if (!pattern) return;

  // Calculate new average engagement
  const currentAvg = pattern.avg_engagement || 0;
  const timesUsed = pattern.times_used || 0;
  const newAvg = (currentAvg * timesUsed + engagement) / (timesUsed + 1);

  // Update success rate based on engagement
  const engagementScore = engagement > 5 ? 1 : 0;
  const currentSuccessRate = pattern.success_rate || 0;
  const newSuccessRate = (
    (currentSuccessRate * timesUsed + engagementScore * 100) /
    (timesUsed + 1)
  );

  await supabase
    .from('viral_patterns')
    .update({
      times_used: timesUsed + 1,
      avg_engagement: newAvg,
      success_rate: newSuccessRate,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', patternId);
}

// Get insights for user dashboard
export async function getViralInsights(userId: string) {
  const supabase = createAdminClient();

  // Get recent performance trend
  const { data: recentPosts } = await supabase
    .from('post_performance')
    .select('actual_engagement, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get best performing patterns
  const { data: bestPatterns } = await supabase
    .from('viral_patterns')
    .select('pattern_type, pattern_description, success_rate')
    .eq('user_id', userId)
    .order('success_rate', { ascending: false })
    .limit(3);

  // Get patterns that need improvement
  const { data: worstPatterns } = await supabase
    .from('viral_patterns')
    .select('pattern_type, pattern_description, success_rate')
    .eq('user_id', userId)
    .order('success_rate', { ascending: true })
    .limit(3);

  return {
    recentTrend: recentPosts?.map(p => ({
      engagement: p.actual_engagement,
      date: p.created_at,
    })) || [],
    bestPatterns: bestPatterns || [],
    improvementAreas: worstPatterns || [],
  };
}


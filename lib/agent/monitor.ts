import { createAdminClient } from '@/lib/supabase/admin';

export async function logAgentAction(
  userId: string,
  action: {
    request: string;
    toolsUsed: string[];
    contextTokens: number;
    responseTime: number;
    success: boolean;
  }
) {
  const supabase = createAdminClient();

  await supabase.from('agent_logs').insert({
    user_id: userId,
    request: action.request,
    tools_used: action.toolsUsed,
    context_tokens: action.contextTokens,
    response_time_ms: action.responseTime,
    success: action.success,
  });
}

export async function getAgentStats(userId: string) {
  const supabase = createAdminClient();

  const { data: logs } = await supabase
    .from('agent_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!logs || logs.length === 0) {
    return null;
  }

  const avgResponseTime =
    logs.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / logs.length;

  const successRate =
    (logs.filter((log) => log.success).length / logs.length) * 100;

  const mostUsedTools = logs
    .flatMap((log) => log.tools_used || [])
    .reduce((acc: Record<string, number>, tool) => {
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {});

  return {
    totalRequests: logs.length,
    avgResponseTime: Math.round(avgResponseTime),
    successRate: successRate.toFixed(1),
    mostUsedTools: Object.entries(mostUsedTools)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count })),
  };
}


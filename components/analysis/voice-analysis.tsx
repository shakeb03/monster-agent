'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface VoiceAnalysisProps {
  data: {
    overall_tone: string | null;
    writing_style: string | null;
    common_topics: string[];
    strengths: string[];
    weaknesses: string[];
    top_performing_elements: string[];
    recommendations: string[];
    analysis_summary: string | null;
  } | null;
}

export default function VoiceAnalysis({ data }: VoiceAnalysisProps) {
  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">
        No voice analysis available yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.analysis_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.analysis_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Tone & Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tone & Style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.overall_tone && (
            <div>
              <p className="text-xs font-medium mb-1">Tone</p>
              <Badge variant="secondary">{data.overall_tone}</Badge>
            </div>
          )}
          {data.writing_style && (
            <div>
              <p className="text-xs font-medium mb-1">Style</p>
              <p className="text-sm text-muted-foreground">{data.writing_style}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topics */}
      {data.common_topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Common Topics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.common_topics.map((topic, i) => (
                <Badge key={i} variant="outline">
                  {topic}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {data.strengths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.strengths.map((strength, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  {strength}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Areas for Improvement */}
      {data.weaknesses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Areas for Improvement</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.weaknesses.map((weakness, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="text-yellow-500 mr-2">•</span>
                  {weakness}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Top Performing Elements */}
      {data.top_performing_elements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What Works Best</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.top_performing_elements.map((element, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="mr-2">🎯</span>
                  {element}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start">
                  <span className="mr-2">💡</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

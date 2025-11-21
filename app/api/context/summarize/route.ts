import { auth } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { summarizeLongContext } from '@/lib/context/summarizer';

export async function POST(req: NextRequest) {
  try {
    const { userId: authUserId } = auth();
    
    if (!authUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId, userId }: { chatId: string; userId: string } = await req.json();

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: 'chatId and userId are required' },
        { status: 400 }
      );
    }

    // Perform long context summarization
    await summarizeLongContext(chatId, userId);

    return NextResponse.json({
      success: true,
      message: 'Context summarized successfully',
    });
  } catch (error) {
    console.error('Context summarize error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


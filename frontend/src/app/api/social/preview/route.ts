import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const topic: string = typeof body.topic === 'string' ? body.topic.trim() : '';

  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured in .env' }, { status: 500 });
  }

  const prompt = `You are a social media content writer. Create two distinct posts about: "${topic}"

FACEBOOK post:
- 150–300 words, conversational professional tone
- 2–3 paragraphs: hook → value/story → call to action
- Max 2 hashtags (or none)

INSTAGRAM caption:
- Punchy opening line (under 125 chars so it shows before "more")
- 80–150 words total, visual and emotional tone
- End with 5–10 relevant hashtags on their own line
- No clickable links

The two posts MUST be meaningfully different — not the same text reworded.

Respond ONLY with valid JSON in this exact shape:
{"facebook": "...", "instagram": "..."}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: `Groq API error: ${errText}` }, { status: 502 });
  }

  const data = await res.json();
  let parsed: { facebook?: string; instagram?: string };
  try {
    parsed = JSON.parse(data.choices[0].message.content);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  return NextResponse.json({
    facebook: parsed.facebook ?? '',
    instagram: parsed.instagram ?? '',
  });
}

import { NextResponse } from 'next/server';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const res = await fetch('http://127.0.0.1:8001/health', {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json({ mcp: 'ok', timestamp });
    }
    return NextResponse.json({ mcp: 'down', timestamp });
  } catch {
    return NextResponse.json({ mcp: 'down', timestamp });
  }
}

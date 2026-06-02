import matter from 'gray-matter';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const { data, content: body } = matter(content);
  return { data, content: body };
}

export interface ParsedLogEntry {
  time: string;
  domain: string;
  action: string;
  result: string;
  raw: string;
}

// Matches: [HH:MM:SS] [domain] ACTION: result
const WITH_DOMAIN = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^\]]+)\]\s+(\S+):\s+(.+)$/;
// Matches: [HH:MM:SS] ACTION: result  (no domain bracket)
const NO_DOMAIN = /^\[(\d{2}:\d{2}:\d{2})\]\s+([A-Z_]+):\s+(.+)$/;

export function parseLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.trim();

  let m = WITH_DOMAIN.exec(trimmed);
  if (m) {
    return { time: m[1], domain: m[2].toLowerCase(), action: m[3], result: m[4], raw: line };
  }

  m = NO_DOMAIN.exec(trimmed);
  if (m) {
    return { time: m[1], domain: 'system', action: m[2], result: m[3], raw: line };
  }

  return null;
}

export function parseLogFile(content: string): ParsedLogEntry[] {
  return content
    .split('\n')
    .map(parseLogLine)
    .filter((e): e is ParsedLogEntry => e !== null);
}

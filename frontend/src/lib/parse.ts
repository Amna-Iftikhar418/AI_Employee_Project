import matter from 'gray-matter';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const { data, content: body } = matter(content);
  return { data, content: body };
}

export type LogStatus = 'success' | 'error' | 'warning' | 'info';

export interface ParsedLogEntry {
  time: string;
  domain: string;
  action: string;
  label: string;
  status: LogStatus;
  result: string;
  raw: string;
}

// Matches: [HH:MM:SS] [domain] ACTION: result
const WITH_DOMAIN = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^\]]+)\]\s+(\S+):\s+(.+)$/;
// Matches: [HH:MM:SS] ACTION: result  (no domain bracket)
const NO_DOMAIN = /^\[(\d{2}:\d{2}:\d{2})\]\s+([A-Z_]+):\s+(.+)$/;

const ERROR_RE   = /fail|error|invalid|crash|exception|abort|denied/i;
const WARN_RE    = /warn|alert|retry|timeout|missing/i;
const SUCCESS_RE = /success|done|complete|\bok\b|approved|published|sent|created|navigated/i;

function humanizeAction(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectStatus(action: string, result: string): LogStatus {
  const text = `${action} ${result}`;
  if (ERROR_RE.test(text))   return 'error';
  if (WARN_RE.test(text))    return 'warning';
  if (SUCCESS_RE.test(text)) return 'success';
  return 'info';
}

export function parseLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.trim();

  let m = WITH_DOMAIN.exec(trimmed);
  if (m) {
    const action = m[3];
    const result = m[4];
    return {
      time: m[1],
      domain: m[2].toLowerCase(),
      action,
      label: humanizeAction(action),
      status: detectStatus(action, result),
      result,
      raw: line,
    };
  }

  m = NO_DOMAIN.exec(trimmed);
  if (m) {
    const action = m[2];
    const result = m[3];
    return {
      time: m[1],
      domain: 'system',
      action,
      label: humanizeAction(action),
      status: detectStatus(action, result),
      result,
      raw: line,
    };
  }

  return null;
}

export function parseLogFile(content: string): ParsedLogEntry[] {
  return content
    .split('\n')
    .map(parseLogLine)
    .filter((e): e is ParsedLogEntry => e !== null);
}

export interface BufferedInputResult {
  lines: string[];
  remainder: string;
}

export function normalizeTerminalText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function consumeBufferedLines(buffer: string): BufferedInputResult {
  if (!buffer.includes('\n')) {
    return {
      lines: [],
      remainder: buffer
    };
  }

  // Preserve blank submissions and avoid collapsing consecutive newline
  // characters when pasted input spans multiple terminal lines.
  const lines: string[] = [];
  let lineStart = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer.charCodeAt(i) === 10) {
      lines.push(buffer.slice(lineStart, i));
      lineStart = i + 1;
    }
  }

  return {
    lines,
    remainder: buffer.slice(lineStart)
  };
}

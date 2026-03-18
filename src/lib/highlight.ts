import type { CodeToken } from './types';

export function tokenize(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  if (!code) return tokens;

  const KEYWORDS = new Set([
    "int", "float", "double", "char", "void", "return", "if", "else", "while", "for",
    "do", "switch", "case", "break", "continue", "struct", "typedef", "sizeof", "long", 
    "short", "unsigned", "signed", "const", "static", "NULL"
  ]);

  let lineNo = 1;
  let colNo = 1;
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const startCol = colNo;

    // Newline
    if (ch === '\n') {
      lineNo++;
      colNo = 1;
      i++;
      continue;
    }

    // Whitespace (excluding newline)
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      colNo++;
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && code[i + 1] === '/') {
      const start = i;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      tokens.push({
        type: 'comment',
        value: code.substring(start, i),
        line: lineNo,
        column: startCol
      });
      continue;
    }

    // Multi-line comment
    if (ch === '/' && code[i + 1] === '*') {
      const start = i;
      const startLine = lineNo;
      i += 2;
      colNo += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') {
          lineNo++;
          colNo = 1;
        } else {
          colNo++;
        }
        i++;
      }
      i += 2;
      colNo += 2;
      tokens.push({
        type: 'comment',
        value: code.substring(start, i),
        line: startLine,
        column: startCol
      });
      continue;
    }

    // String literals
    if (ch === '"') {
      const start = i;
      i++;
      colNo++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') {
          i++;
          colNo++;
        }
        if (i < code.length) {
          if (code[i] === '\n') {
            lineNo++;
            colNo = 1;
          } else {
            colNo++;
          }
          i++;
        }
      }
      i++; // closing quote
      colNo++;
      tokens.push({
        type: 'string',
        value: code.substring(start, i),
        line: lineNo,
        column: startCol
      });
      continue;
    }

    // Character literals
    if (ch === "'") {
      const start = i;
      i++;
      colNo++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\') {
          i++;
          colNo++;
        }
        if (i < code.length) {
          colNo++;
          i++;
        }
      }
      i++; // closing quote
      colNo++;
      tokens.push({
        type: 'string',
        value: code.substring(start, i),
        line: lineNo,
        column: startCol
      });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const start = i;
      while (i < code.length && /[0-9a-fA-FxX._eE]/.test(code[i])) {
        colNo++;
        i++;
      }
      tokens.push({
        type: 'number',
        value: code.substring(start, i),
        line: lineNo,
        column: startCol
      });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        colNo++;
        i++;
      }
      const value = code.substring(start, i);
      tokens.push({
        type: KEYWORDS.has(value) ? 'keyword' : 'identifier',
        value,
        line: lineNo,
        column: startCol
      });
      continue;
    }

    // Operators and punctuation
    const twoChar = code.substring(i, i + 2);
    const TWO_CHAR_OPS = [
      "==", "!=", "<=", ">=", "&&", "||", "++", "--", 
      "+=", "-=", "*=", "/=", "%=", "->", "<<", ">>"
    ];
    
    if (TWO_CHAR_OPS.includes(twoChar)) {
      tokens.push({
        type: 'operator',
        value: twoChar,
        line: lineNo,
        column: startCol
      });
      i += 2;
      colNo += 2;
      continue;
    }

    // Single character operators
    if ("+-*/%<>=!&|^~?:;,.()[]{}".includes(ch)) {
      tokens.push({
        type: 'operator',
        value: ch,
        line: lineNo,
        column: startCol
      });
      i++;
      colNo++;
      continue;
    }

    // Unknown character
    tokens.push({
      type: 'unknown',
      value: ch,
      line: lineNo,
      column: startCol
    });
    i++;
    colNo++;
  }

  return tokens;
}

export default function highlight(code: string): string {
  if (!code) return "";
  
  let s = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const placeholders: string[] = [];
  let placeholderIndex = 0;
  
  const addPlaceholder = (html: string): string => {
    placeholders.push(html);
    return `\x00${placeholderIndex++}\x00`;
  };

  // Comments (single-line and multi-line)
  s = s.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, (m) => 
    addPlaceholder(`<span style="color:#22c55e;font-style:italic">${m}</span>`)
  );

  // Preprocessor directives
  s = s.replace(/(#[^\n]*)/g, (m) => 
    addPlaceholder(`<span style="color:#a78bfa">${m}</span>`)
  );

  // String literals
  s = s.replace(/("(?:[^"\\]|\\.)*")/g, (m) => 
    addPlaceholder(`<span style="color:#fde68a">${m}</span>`)
  );

  // Numbers
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => 
    addPlaceholder(`<span style="color:#fb923c">${m}</span>`)
  );

  // Keywords
  s = s.replace(
    /\b(int|float|double|char|void|return|if|else|while|for|do|switch|case|break|continue|struct|typedef|sizeof|long|short|unsigned|signed|const|static|NULL)\b/g,
    (m) => addPlaceholder(`<span style="color:#f472b6;font-weight:600">${m}</span>`)
  );

  // Standard library functions
  s = s.replace(
    /\b(printf|scanf|fprintf|putchar|puts|malloc|calloc|free|abs|sqrt|strlen|pow|rand|atoi|strcmp|strcpy|strcat)\b/g,
    (m) => addPlaceholder(`<span style="color:#38bdf8">${m}</span>`)
  );

  // Function calls (identifiers followed by parenthesis)
  s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (m) => 
    addPlaceholder(`<span style="color:#60a5fa">${m}</span>`)
  );

  // Restore placeholders
  for (let i = 0; i < placeholderIndex; i++) {
    s = s.replace(`\x00${i}\x00`, placeholders[i]);
  }

  return s + "\n";
}

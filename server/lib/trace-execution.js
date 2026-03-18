function parseTokenValue(token, memory) {
  const value = token.trim();

  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value, 16);
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  if (/^[A-Za-z_]\w*$/.test(value)) {
    return Number(memory[value] ?? 0);
  }

  return 0;
}

function evaluateSimpleExpression(expression, memory) {
  const expr = expression.trim();

  if (!expr) {
    return 0;
  }

  if (/^\((.+)\)$/.test(expr)) {
    return evaluateSimpleExpression(expr.slice(1, -1), memory);
  }

  const binaryMatch = expr.match(/^([A-Za-z_]\w*|0x[0-9a-fA-F]+|-?\d+)\s*([+\-*/%])\s*([A-Za-z_]\w*|0x[0-9a-fA-F]+|-?\d+)$/);
  if (binaryMatch) {
    const left = parseTokenValue(binaryMatch[1], memory);
    const operator = binaryMatch[2];
    const right = parseTokenValue(binaryMatch[3], memory);

    switch (operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return right === 0 ? left : Math.trunc(left / right);
      case '%':
        return right === 0 ? left : left % right;
      default:
        return left;
    }
  }

  return parseTokenValue(expr, memory);
}

function removeComments(rawLine, inBlockComment) {
  let text = rawLine;
  let blockOpen = inBlockComment;

  if (blockOpen) {
    const blockEnd = text.indexOf('*/');
    if (blockEnd === -1) {
      return { text: '', inBlockComment: true };
    }

    text = text.slice(blockEnd + 2);
    blockOpen = false;
  }

  while (true) {
    const start = text.indexOf('/*');
    if (start === -1) {
      break;
    }

    const end = text.indexOf('*/', start + 2);
    if (end === -1) {
      text = text.slice(0, start);
      blockOpen = true;
      break;
    }

    text = `${text.slice(0, start)} ${text.slice(end + 2)}`;
  }

  const lineComment = text.indexOf('//');
  if (lineComment !== -1) {
    text = text.slice(0, lineComment);
  }

  return { text: text.trim(), inBlockComment: blockOpen };
}

function extractExecutableLines(code, breakpoints) {
  const sourceLines = code.split(/\r?\n/);
  const executableLines = [];
  const seen = new Set();
  let inBlockComment = false;

  sourceLines.forEach((line, index) => {
    const lineNo = index + 1;
    const parsed = removeComments(line, inBlockComment);
    inBlockComment = parsed.inBlockComment;

    if (!parsed.text || parsed.text.startsWith('#')) {
      return;
    }

    executableLines.push({ lineNo, text: parsed.text });
    seen.add(lineNo);
  });

  const uniqueBreakpoints = Array.isArray(breakpoints)
    ? [...new Set(breakpoints.filter((lineNo) => Number.isInteger(lineNo) && lineNo >= 1 && lineNo <= sourceLines.length))]
    : [];

  uniqueBreakpoints.forEach((lineNo) => {
    if (!seen.has(lineNo)) {
      const parsed = removeComments(sourceLines[lineNo - 1] ?? '', false);
      executableLines.push({ lineNo, text: parsed.text || sourceLines[lineNo - 1]?.trim() || `line ${lineNo}` });
      seen.add(lineNo);
    }
  });

  executableLines.sort((a, b) => a.lineNo - b.lineNo);
  return executableLines;
}

function applyLineEffects(line, memory, registers) {
  const declarationMatch = line.match(/^(?:const\s+)?(?:unsigned\s+|signed\s+|long\s+|short\s+|static\s+|volatile\s+)*int\s+(.+);$/);
  if (declarationMatch && !declarationMatch[1].includes('(')) {
    const declarations = declarationMatch[1].split(',').map((chunk) => chunk.trim()).filter(Boolean);

    declarations.forEach((entry) => {
      const parts = entry.split('=').map((part) => part.trim());
      const varName = parts[0]?.match(/^([A-Za-z_]\w*)$/)?.[1];
      if (!varName) {
        return;
      }

      const nextValue = parts[1] ? evaluateSimpleExpression(parts[1], memory) : 0;
      memory[varName] = nextValue;
      registers[`r_${varName}`] = nextValue;
      registers.acc = nextValue;
    });

    return;
  }

  const compoundMatch = line.match(/^([A-Za-z_]\w*)\s*([+\-*/%]?=)\s*(.+);$/);
  if (compoundMatch) {
    const [, varName, operator, rhs] = compoundMatch;
    const current = Number(memory[varName] ?? 0);
    const right = evaluateSimpleExpression(rhs, memory);

    let nextValue = right;
    switch (operator) {
      case '+=':
        nextValue = current + right;
        break;
      case '-=':
        nextValue = current - right;
        break;
      case '*=':
        nextValue = current * right;
        break;
      case '/=':
        nextValue = right === 0 ? current : Math.trunc(current / right);
        break;
      case '%=':
        nextValue = right === 0 ? current : current % right;
        break;
      case '=':
      default:
        nextValue = right;
        break;
    }

    memory[varName] = nextValue;
    registers[`r_${varName}`] = nextValue;
    registers.acc = nextValue;
    return;
  }

  const incrementMatch = line.match(/^([A-Za-z_]\w*)(\+\+|--);$/);
  if (incrementMatch) {
    const [, varName, operation] = incrementMatch;
    const current = Number(memory[varName] ?? 0);
    const nextValue = operation === '++' ? current + 1 : current - 1;
    memory[varName] = nextValue;
    registers[`r_${varName}`] = nextValue;
    registers.acc = nextValue;
  }
}

export async function traceExecution(code, breakpoints = []) {
  const executableLines = extractExecutableLines(code, breakpoints);
  const steps = [];
  const memory = {};
  const registers = { pc: 0, sp: 4096, acc: 0 };
  const timestampBase = Date.now();

  executableLines.forEach(({ lineNo, text }, index) => {
    applyLineEffects(text, memory, registers);
    const stepNumber = index + 1;

    registers.pc = lineNo;
    registers.sp = 4096 - stepNumber * 4;

    steps.push({
      stepNumber,
      lineNo,
      registers: { ...registers },
      memory: { ...memory },
      instructionPointer: `line:${lineNo}`,
      timestamp: timestampBase + stepNumber
    });
  });

  return {
    success: true,
    steps,
    totalSteps: steps.length,
    errors: []
  };
}

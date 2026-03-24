export interface CodeFeatureSnapshot {
  normalizedSource: string;
  functionNames: string[];
  identifiers: string[];
  identifierSet: Set<string>;
}

const FUNCTION_REGEX =
  /\b(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:long\s+|short\s+)?(?:[A-Za-z_]\w*[\s*]+)+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;

const IDENTIFIER_REGEX = /\b[a-z_]\w*\b/g;

export function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsWord(source: string, keyword: string): boolean {
  if (keyword.includes(' ')) {
    return source.includes(keyword);
  }

  const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
  return regex.test(source);
}

export function countRegexMatches(source: string, regex: RegExp): number {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  return Array.from(source.matchAll(globalRegex)).length;
}

export function extractCodeFeatures(code: string): CodeFeatureSnapshot {
  const normalizedSource = stripCommentsAndStrings(code).toLowerCase();
  const functionNames = Array.from(normalizedSource.matchAll(FUNCTION_REGEX), (match) => match[1]);
  const identifiers = Array.from(normalizedSource.matchAll(IDENTIFIER_REGEX), (match) => match[0]);

  return {
    normalizedSource,
    functionNames,
    identifiers,
    identifierSet: new Set(identifiers)
  };
}

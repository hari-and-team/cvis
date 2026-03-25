import type { CodeTypeReport, SectionTypeInsight } from './code-type-finder';

export type ReverseReviewTone = 'keep' | 'review' | 'refactor';
export type ReverseFindingSeverity = 'info' | 'watch' | 'risk';

export interface ReverseSectionReview {
  id: string;
  title: string;
  location: string;
  purpose: string;
  verdict: ReverseReviewTone;
  recommendation: string;
}

export interface ReverseFinding {
  id: string;
  title: string;
  severity: ReverseFindingSeverity;
  detail: string;
  recommendation: string;
}

export interface ReverseAnalysisReport {
  sectionReviews: ReverseSectionReview[];
  safetyFindings: ReverseFinding[];
  optimizationFindings: ReverseFinding[];
}

export function analyzeReverse(source: string, report: CodeTypeReport): ReverseAnalysisReport {
  const sectionReviews = report.sections.map((section) => reviewSection(source, section));
  const safetyFindings = buildSafetyFindings(source);
  const optimizationFindings = buildOptimizationFindings(source, report);

  return {
    sectionReviews,
    safetyFindings,
    optimizationFindings
  };
}

function reviewSection(source: string, section: SectionTypeInsight): ReverseSectionReview {
  const title = section.title.trim();
  const lowerTitle = title.toLowerCase();
  const sectionSource = getSectionSource(source, section.startLine, section.endLine);
  const span = section.endLine - section.startLine + 1;
  const intentLabel = section.label.toLowerCase();

  if (lowerTitle === 'program') {
    return {
      id: `section:${title}:${section.startLine}`,
      title,
      location: lineRange(section),
      purpose: 'Top-level program overview and shared execution shape.',
      verdict: 'keep',
      recommendation: 'Keep this thin. Let real behavior live in focused functions instead of top-level branching.'
    };
  }

  if (lowerTitle === 'global scope') {
    return {
      id: `section:${title}:${section.startLine}`,
      title,
      location: lineRange(section),
      purpose: 'Stores shared state used across multiple operations.',
      verdict: /\b(static|const)\b/.test(sectionSource) ? 'review' : 'refactor',
      recommendation:
        'If this state changes often, wrap it in a struct and pass it explicitly so testing and tracing stay safer.'
    };
  }

  if (lowerTitle === 'main' || lowerTitle === 'main()') {
    return {
      id: `section:${title}:${section.startLine}`,
      title,
      location: lineRange(section),
      purpose: 'Coordinates control flow, input, and output for the whole program.',
      verdict: span > 24 ? 'refactor' : 'review',
      recommendation:
        span > 24
          ? 'Shrink main() into orchestration only. Move menu handling, validation, and repeated actions into helpers.'
          : 'Keep main() as the coordinator and avoid putting business logic directly inside it.'
    };
  }

  const mixesInputAndLogic = /\bscanf\s*\(/.test(sectionSource) && /\b(return|=|\+\+|--|if|while|for)\b/.test(sectionSource);

  return {
    id: `section:${title}:${section.startLine}`,
    title,
    location: lineRange(section),
    purpose: `Implements ${intentLabel === 'generic algorithm' ? 'a focused program step' : intentLabel} behavior.`,
    verdict: mixesInputAndLogic || span > 18 ? 'review' : 'keep',
    recommendation: mixesInputAndLogic
      ? 'Split user I/O from the core operation so the logic can be reused in tests and safer trace flows.'
      : 'Keep this function focused on one job and avoid pulling unrelated state or printing into it.'
  };
}

function buildSafetyFindings(source: string): ReverseFinding[] {
  const findings: ReverseFinding[] = [];
  const cleaned = source;

  if (/\bscanf\s*\(/.test(cleaned) && !/\bif\s*\(\s*scanf\s*\(/.test(cleaned)) {
    findings.push({
      id: 'safety:scanf-checks',
      title: 'Unchecked scanf() results',
      severity: 'risk',
      detail: 'The program reads input but does not verify whether scanf() actually parsed the expected values.',
      recommendation: 'Check scanf() return values before using the inputs, especially in menu-driven loops.'
    });
  }

  if (hasMutableGlobalState(cleaned)) {
    findings.push({
      id: 'safety:globals',
      title: 'Mutable global state',
      severity: 'watch',
      detail: 'Shared globals make control flow harder to reason about and increase accidental coupling between functions.',
      recommendation: 'Move mutable globals into an explicit state struct when you want better testability and safer updates.'
    });
  }

  if (/#define\s+[A-Z_]+\s+\d+/.test(cleaned) && /\[[A-Z_][A-Z0-9_]*\]/.test(cleaned)) {
    findings.push({
      id: 'safety:fixed-capacity',
      title: 'Fixed-capacity storage',
      severity: 'watch',
      detail: 'The program relies on a compile-time capacity limit, which is simple but easy to outgrow.',
      recommendation: 'Keep the bound check, and consider dynamic allocation if the input size should scale.'
    });
  }

  if (/\bmalloc\s*\(/.test(cleaned) && !/\bfree\s*\(/.test(cleaned)) {
    findings.push({
      id: 'safety:malloc-without-free',
      title: 'Allocation without visible cleanup',
      severity: 'risk',
      detail: 'The code allocates heap memory but there is no matching free() in the current source.',
      recommendation: 'Add ownership rules and free allocated memory on every exit path.'
    });
  }

  if (/\b(gets|strcpy|strcat)\s*\(/.test(cleaned)) {
    findings.push({
      id: 'safety:unsafe-c-apis',
      title: 'Unsafe C string APIs',
      severity: 'risk',
      detail: 'The code uses legacy string APIs that can overflow buffers.',
      recommendation: 'Prefer fgets(), snprintf(), strncat(), or explicit bounds-aware copying.'
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: 'safety:none-critical',
      title: 'No obvious safety red flags',
      severity: 'info',
      detail: 'The current scan did not find a high-risk input, memory, or bounds issue in the source text.',
      recommendation: 'Keep validating user input and watch for hidden edge cases as features grow.'
    });
  }

  return findings;
}

function buildOptimizationFindings(source: string, report: CodeTypeReport): ReverseFinding[] {
  const findings: ReverseFinding[] = [];
  const mainSection = report.sections.find((section) => {
    const title = section.title.trim().toLowerCase();
    return title === 'main' || title === 'main()';
  });

  if (/\bO\(n\^2\)|O\(2\^n\)|O\(n!\)/.test(report.overallTimeComplexity)) {
    findings.push({
      id: 'opt:time-complexity',
      title: 'Algorithmic hotspot',
      severity: 'watch',
      detail: `The overall time estimate is ${report.overallTimeComplexity}, so runtime growth may become the main bottleneck.`,
      recommendation: 'Review the dominant loops first and see whether a better data structure or traversal strategy can reduce the cost.'
    });
  }

  if (mainSection && mainSection.endLine - mainSection.startLine + 1 > 24) {
    findings.push({
      id: 'opt:main-too-large',
      title: 'main() is carrying too much',
      severity: 'watch',
      detail: 'The entry point is long enough that control flow, input handling, and core logic are starting to blur together.',
      recommendation: 'Extract helpers for menu flow, validation, and operation dispatch so optimization work stays local.'
    });
  }

  if (/\bprintf\s*\(/.test(source) && /\bscanf\s*\(/.test(source)) {
    findings.push({
      id: 'opt:io-coupling',
      title: 'Logic is coupled to terminal I/O',
      severity: 'watch',
      detail: 'Interactive input and output are woven into the same functions as the core data-structure operations.',
      recommendation: 'Separate the pure operation from the console wrapper so tests, tracing, and teacher-driven testcases can reuse the same logic.'
    });
  }

  if (hasMutableGlobalState(source) && report.sections.length > 3) {
    findings.push({
      id: 'opt:state-ownership',
      title: 'State ownership could be cleaner',
      severity: 'info',
      detail: 'Multiple sections appear to share the same mutable state, which makes change impact wider than it needs to be.',
      recommendation: 'Use a dedicated state object and pass it into operations to tighten ownership boundaries.'
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: 'opt:none-urgent',
      title: 'No obvious optimization pressure',
      severity: 'info',
      detail: 'The current structure looks reasonable for this code size and complexity estimate.',
      recommendation: 'Focus on readability and edge-case coverage before chasing micro-optimizations.'
    });
  }

  return findings;
}

function hasMutableGlobalState(source: string): boolean {
  const lines = source.split('\n');
  let functionStarted = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[a-z_]\w*\s+[a-z_]\w*\s*\([^;]*\)\s*\{?$/i.test(line) || /\)\s*\{/.test(line)) {
      functionStarted = true;
    }

    if (functionStarted) {
      break;
    }

    if (
      !line.startsWith('#') &&
      /;$/.test(line) &&
      !/\bconst\b/.test(line) &&
      !/\btypedef\b/.test(line) &&
      !/\bstruct\b/.test(line)
    ) {
      return true;
    }
  }

  return false;
}

function getSectionSource(source: string, startLine: number, endLine: number): string {
  const lines = source.split('\n');
  return lines.slice(Math.max(startLine - 1, 0), Math.max(endLine, startLine - 1)).join('\n');
}

function lineRange(section: SectionTypeInsight): string {
  return `L${section.startLine}-${section.endLine}`;
}

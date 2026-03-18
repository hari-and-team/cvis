import { ctrlBtnStyle } from '$lib/theme';

export const EDITOR_MONO = {
  fontFamily: '"Cascadia Code", "Fira Code", "SF Mono", Monaco, "Courier New", monospace',
  fontSize: '13px',
  lineHeight: '22px',
  tabSize: 2
} as const;

function toCssDeclaration(property: string, value: string | number): string {
  return `${property.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`;
}

export function buildControlButtonStyle(overrides: Record<string, string | number> = {}): string {
  return Object.entries({ ...ctrlBtnStyle, ...overrides })
    .map(([key, value]) => toCssDeclaration(key, value))
    .join('; ');
}

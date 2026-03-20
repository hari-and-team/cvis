// One Dark Pro color palette
export const TH = {
  // Backgrounds
  bgDeep: "#21252b",     // Sidebar/deeper background
  bgCard: "#282c34",     // Main background
  bgRaised: "#2c313a",   // Raised/hover elements
  
  // Borders
  border: "#3e4451",
  borderDeep: "#181a1f",
  
  // Text colors
  dimText: "#5c6370",    // Comments/dim text
  midText: "#abb2bf",    // Normal text
  bright: "#e5e5e5",     // Bright/highlighted text
  white: "#ffffff",
  
  // Accent colors
  accent: "#61afef",     // Blue (primary accent)
  blue: "#61afef",
  green: "#98c379",
  yellow: "#e5c07b",
  orange: "#d19a66",
  red: "#e06c75",
  purple: "#c678dd",
  cyan: "#56b6c2",
} as const;

export type Theme = typeof TH;

export const ctrlBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "7px 10px",
  background: TH.bgRaised,
  border: `1px solid ${TH.border}`,
  borderRadius: 7,
  color: TH.midText,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.5,
} as const;

// Helper to build control button style with optional overrides
export function buildControlButtonStyle(overrides: Record<string, string | number> = {}): string {
  const style = { ...ctrlBtnStyle, ...overrides };
  return Object.entries(style)
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      const cssValue = typeof value === 'number' && !['opacity', 'fontWeight', 'zIndex', 'flex'].includes(key) 
        ? `${value}px` 
        : value;
      return `${cssKey}: ${cssValue}`;
    })
    .join('; ');
}

// CSS variable definitions for app.css usage
export const cssVars = `
  --bg-deep: ${TH.bgDeep};
  --bg-card: ${TH.bgCard};
  --bg-raised: ${TH.bgRaised};
  --border: ${TH.border};
  --border-deep: ${TH.borderDeep};
  --text-dim: ${TH.dimText};
  --text-mid: ${TH.midText};
  --text-bright: ${TH.bright};
  --accent: ${TH.accent};
  --blue: ${TH.blue};
  --green: ${TH.green};
  --yellow: ${TH.yellow};
  --orange: ${TH.orange};
  --red: ${TH.red};
  --purple: ${TH.purple};
  --cyan: ${TH.cyan};
`;

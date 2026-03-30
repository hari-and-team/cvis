// Shell-inspired twilight palette based on the local zsh/kitty theme
export const TH = {
  // Backgrounds
  bgDeep: "#232730",
  bgCard: "#282c34",
  bgRaised: "#313643",
  
  // Borders
  border: "#454c5d",
  borderDeep: "#1a1e25",
  
  // Text colors
  dimText: "#8d95a4",
  midText: "#c5cbd6",
  bright: "#e5e9f0",
  white: "#ffffff",
  
  // Accent colors
  accent: "#7f9fca",
  blue: "#7f9fca",
  green: "#90af80",
  yellow: "#c2ab77",
  orange: "#bd9478",
  red: "#b87a86",
  purple: "#9181b2",
  cyan: "#88afc1",
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

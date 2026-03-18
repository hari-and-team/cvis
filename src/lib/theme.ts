export const TH = {
  bgDeep: "#0a0e1a",
  bgCard: "#0f1629",
  bgRaised: "#161e35",
  border: "#1e2d4a",
  dimText: "#4a6080",
  midText: "#7a95b8",
  bright: "#c8daf4",
  white: "#eef4ff",
  accent: "#4f46e5",
  green: "#22d3a5",
  orange: "#f59e0b",
  red: "#f43f5e",
  purple: "#a78bfa",
  cyan: "#06b6d4",
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

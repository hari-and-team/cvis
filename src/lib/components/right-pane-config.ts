import { Eye, ListTree, Target, Terminal } from 'lucide-svelte';

// Shared right-pane palette aligned to the local shell theme
export const ShellPalette = {
  bgMain: '#282c34',
  bgDeep: '#232730',
  bgHover: '#313643',
  border: '#454c5d',
  text: '#c5cbd6',
  textDim: '#8d95a4',
  textBright: '#e5e9f0',
  highlight: '#b7acd8',
  green: '#90af80',
  blue: '#7f9fca',
  purple: '#9181b2',
  cyan: '#88afc1',
  red: '#b87a86',
  orange: '#bd9478',
} as const;

export type RightPaneTabId = 'console' | 'visualizer' | 'analysis' | 'mentor';

export const RIGHT_PANE_TABS: Array<{
  id: RightPaneTabId;
  label: string;
  Icon: typeof Terminal;
  color: string;
}> = [
  { id: 'console', label: 'Console', Icon: Terminal, color: ShellPalette.highlight },
  { id: 'visualizer', label: 'Visualizer', Icon: Eye, color: ShellPalette.highlight },
  { id: 'analysis', label: 'Analysis', Icon: ListTree, color: ShellPalette.highlight },
  { id: 'mentor', label: 'Mentor', Icon: Target, color: ShellPalette.orange }
];

export const VISUALIZER_FEATURES = [
  { label: 'Structs', color: ShellPalette.purple },
  { label: 'Graph intent', color: ShellPalette.cyan },
  { label: 'Linked lists', color: ShellPalette.blue },
  { label: 'malloc/free', color: ShellPalette.red },
  { label: 'Pointers', color: ShellPalette.cyan },
  { label: 'Call stack', color: ShellPalette.green },
  { label: 'Recursion', color: ShellPalette.orange },
  { label: 'Arrays', color: ShellPalette.blue },
  { label: 'Globals', color: ShellPalette.purple },
  { label: 'switch', color: ShellPalette.cyan }
] as const;

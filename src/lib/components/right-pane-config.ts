import { Eye, ListTree, Terminal } from 'lucide-svelte';

// One Dark color palette for right pane
export const OneDark = {
  bgMain: '#282c34',
  bgDeep: '#21252b',
  bgHover: '#2c313a',
  border: '#3e4451',
  text: '#abb2bf',
  textDim: '#5c6370',
  textBright: '#e5e5e5',
  green: '#98c379',
  blue: '#61afef',
  purple: '#c678dd',
  cyan: '#56b6c2',
  red: '#e06c75',
  orange: '#d19a66',
} as const;

export type RightPaneTabId = 'output' | 'visualizer' | 'analysis';

export const RIGHT_PANE_TABS: Array<{
  id: RightPaneTabId;
  label: string;
  Icon: typeof Terminal;
  color: string;
}> = [
  { id: 'output', label: 'Output', Icon: Terminal, color: OneDark.green },
  { id: 'visualizer', label: 'Visualizer', Icon: Eye, color: OneDark.blue },
  { id: 'analysis', label: 'Analysis', Icon: ListTree, color: OneDark.purple }
];

export const VISUALIZER_FEATURES = [
  { label: 'Structs', color: OneDark.purple },
  { label: 'Graph intent', color: OneDark.cyan },
  { label: 'Linked lists', color: OneDark.blue },
  { label: 'malloc/free', color: OneDark.red },
  { label: 'Pointers', color: OneDark.cyan },
  { label: 'Call stack', color: OneDark.green },
  { label: 'Recursion', color: OneDark.orange },
  { label: 'Arrays', color: OneDark.blue },
  { label: 'Globals', color: OneDark.purple },
  { label: 'switch', color: OneDark.cyan }
] as const;

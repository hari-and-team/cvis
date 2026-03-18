import { Cpu, Eye, Keyboard, ListTree, Terminal } from 'lucide-svelte';
import { TH } from '$lib/theme';

export type RightPaneTabId = 'output' | 'input' | 'visualizer' | 'analysis';

export const RIGHT_PANE_TABS: Array<{
  id: RightPaneTabId;
  label: string;
  Icon: typeof Terminal;
  color: string;
}> = [
  { id: 'output', label: 'Output', Icon: Terminal, color: TH.green },
  { id: 'input', label: 'Input', Icon: Keyboard, color: TH.orange },
  { id: 'visualizer', label: 'Visualizer', Icon: Eye, color: TH.accent },
  { id: 'analysis', label: 'Analysis', Icon: ListTree, color: TH.purple }
];

export const VISUALIZER_FEATURES = [
  'Structs',
  'Linked lists',
  'malloc/free',
  'Pointers',
  'Call stack',
  'Recursion',
  'Arrays',
  'Globals',
  'switch'
] as const;

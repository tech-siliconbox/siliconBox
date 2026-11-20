import { cn } from '@/lib/cn';
import { type Abilities, SESSION_SCRIPT } from '../abilities';
import type { ToolAction } from '../tool-actions';
import { TOOL_ICONS, type ToolIcon } from './tool-icons';

type Tool = {
  label: string;
  icon: ToolIcon;
  /** The Tcl command it runs, as its tooltip. */
  title: string;
  tone?: 'go' | 'halt';
  when: (can: Abilities) => boolean;
  action: (can: Abilities) => ToolAction;
};

/** The toolbar's buttons in their groups, each enabled only when it can run now. */
const TOOL_GROUPS: readonly (readonly Tool[])[] = [
  [
    {
      label: 'Add Files',
      icon: 'add',
      title: 'Add design, SVA and Tcl files to the session',
      when: (can) => can.open,
      action: () => ({ kind: 'addFiles' }),
    },
    {
      label: 'Run Script',
      icon: 'script',
      title: `source ${SESSION_SCRIPT}`,
      when: (can) => can.script,
      action: () => ({ kind: 'command', line: `source ${SESSION_SCRIPT}` }),
    },
  ],
  [
    {
      label: 'Analyze',
      icon: 'analyze',
      title: 'analyze -sv <all source files>',
      when: (can) => can.analyze !== null,
      action: (can) => ({ kind: 'command', line: can.analyze ?? '' }),
    },
    {
      label: 'Elaborate',
      icon: 'elaborate',
      title: 'elaborate -top <module>',
      when: (can) => can.elaborate,
      action: () => ({ kind: 'form', form: 'elaborate' }),
    },
    {
      label: 'Clock / Reset',
      icon: 'clock',
      title: 'clock <signal>, reset <expr>',
      when: (can) => can.elaborated,
      action: () => ({ kind: 'form', form: 'setup' }),
    },
  ],
  [
    {
      label: 'Prove',
      icon: 'prove',
      title: 'prove -all',
      tone: 'go',
      when: (can) => can.elaborated,
      action: () => ({ kind: 'command', line: 'prove -all' }),
    },
    {
      label: 'Stop',
      icon: 'stop',
      title: 'stop',
      tone: 'halt',
      when: (can) => can.stop,
      action: () => ({ kind: 'stop' }),
    },
  ],
  [
    {
      label: 'Run History',
      icon: 'history',
      title: 'Your proof runs, with their files, results and traces',
      when: () => true,
      action: () => ({ kind: 'history' }),
    },
  ],
];

const TONE = { go: 'enabled:text-ok enabled:font-semibold', halt: 'enabled:text-danger' } as const;

/** Praman's toolbar: the main steps of a proof, from adding files to proving. */
export function ToolBar({
  can,
  onAction,
}: {
  can: Abilities;
  onAction: (action: ToolAction) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Praman tools"
      className="flex h-9 items-center gap-0.5 border-b border-border bg-muted px-2"
    >
      {TOOL_GROUPS.map((group, index) => (
        <div key={group[0]?.label} className="flex items-center gap-0.5">
          {index > 0 && <span aria-hidden="true" className="mx-1.5 h-[18px] w-px bg-border" />}
          {group.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.title}
              disabled={!tool.when(can)}
              onClick={() => onAction(tool.action(can))}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-[3px] border border-transparent px-2 text-[13px]',
                'enabled:hover:border-border enabled:hover:bg-background disabled:text-muted-foreground disabled:[&_svg]:opacity-45',
                tool.tone !== undefined && TONE[tool.tone],
              )}
            >
              {TOOL_ICONS[tool.icon]}
              {tool.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

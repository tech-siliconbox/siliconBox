'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SESSION_SCRIPT } from '../abilities';
import type { PramanProperty, TreeNode } from '../praman-snapshot';
import { instanceRollup } from '../property-rows';
import { StatusIcon } from './status-icon';
import { Code } from './welcome';

type HierarchyPanelProps = {
  tree: TreeNode | null;
  properties: PramanProperty[];
  /** The instance whose properties the table shows ('' for all). */
  selected: string;
  onSelect: (path: string) => void;
  /** Opens the file where an instance's module is written, at that line. */
  onSource: (file: string, line: number) => void;
  analyzed: boolean;
};

/** The elaborated design's instances: each with its properties' count and worst status. */
export function HierarchyPanel({ tree, analyzed, ...rest }: HierarchyPanelProps) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (path: string) =>
    setClosed(
      closed.has(path)
        ? new Set([...closed].filter((each) => each !== path))
        : new Set([...closed, path]),
    );
  if (tree === null) {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        {analyzed ? (
          <>
            The sources are analyzed. Build the design with{' '}
            <Code>elaborate -top &lt;module&gt;</Code>.
          </>
        ) : (
          <>
            No design is elaborated. Add files, then run <Code>analyze</Code> and{' '}
            <Code>elaborate</Code>, or <Code>source {SESSION_SCRIPT}</Code>.
          </>
        )}
      </p>
    );
  }
  return (
    <ul aria-label="Design hierarchy" className="py-1 text-[13px]">
      <TreeItem node={tree} depth={0} closed={closed} onToggle={toggle} {...rest} />
    </ul>
  );
}

type TreeItemProps = Omit<HierarchyPanelProps, 'tree' | 'analyzed'> & {
  node: TreeNode;
  depth: number;
  closed: ReadonlySet<string>;
  onToggle: (path: string) => void;
};

function TreeItem({ node, depth, closed, onToggle, ...rest }: TreeItemProps) {
  const open = !closed.has(node.path);
  return (
    <li>
      <TreeRow node={node} depth={depth} open={open} onToggle={onToggle} {...rest} />
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              closed={closed}
              onToggle={onToggle}
              {...rest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

type TreeRowProps = Omit<TreeItemProps, 'closed'> & { open: boolean };

const describe = (node: TreeNode) =>
  `${node.path} (${node.module})${node.file === '' ? '' : `, ${node.file}:${node.line}`}`;

/**
 * One instance: fold it, or choose it to show only its properties in the table. A double click,
 * or the chosen row's Source button, opens where its module is written.
 */
function TreeRow({
  node,
  depth,
  open,
  onToggle,
  properties,
  selected,
  onSelect,
  onSource,
}: TreeRowProps) {
  const chosen = selected === node.path;
  const pad = DEPTH_PAD[Math.min(depth, DEPTH_PAD.length - 1)];
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 py-0.5 pr-2 hover:bg-muted',
        chosen && 'bg-info-light',
      )}
    >
      <span aria-hidden="true" className={cn('shrink-0', pad)} />
      <FoldButton node={node} open={open} onToggle={onToggle} />
      <button
        type="button"
        aria-pressed={chosen}
        title={describe(node)}
        onClick={() => onSelect(chosen ? '' : node.path)}
        onDoubleClick={() => node.file !== '' && onSource(node.file, node.line)}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-[2px] border border-info bg-info-light"
        />
        <span className="font-semibold">{node.name}</span>
        {node.name !== node.module && (
          <span className="text-muted-foreground">({node.module})</span>
        )}
        <Rollup properties={properties} path={node.path} />
      </button>
      {chosen && <SourceButton node={node} onSource={onSource} />}
    </div>
  );
}

/** Opens where the chosen instance's module is written (a keyboard's double click). */
function SourceButton({ node, onSource }: Pick<TreeRowProps, 'node' | 'onSource'>) {
  if (node.file === '') return null;
  return (
    <button
      type="button"
      title={`Open ${node.file} at line ${node.line}`}
      onClick={() => onSource(node.file, node.line)}
      className="shrink-0 text-[11px] font-semibold text-info hover:underline"
    >
      Source
    </button>
  );
}

function FoldButton({ node, open, onToggle }: Pick<TreeRowProps, 'node' | 'open' | 'onToggle'>) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`Fold ${node.name}`}
      onClick={() => onToggle(node.path)}
      className={cn(
        'w-3 text-[10px] text-muted-foreground',
        node.children.length === 0 && 'invisible',
      )}
    >
      {open ? '▼' : '▶'}
    </button>
  );
}

/** How many properties an instance holds, and the worst of their results. */
function Rollup({ properties, path }: { properties: PramanProperty[]; path: string }) {
  const { count, worst } = instanceRollup(properties, path);
  if (count === 0 || worst === null) return null;
  return (
    <span className="ml-auto flex items-center gap-1.5">
      <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
        {count}
      </span>
      <StatusIcon status={worst} size={13} />
    </span>
  );
}

/** Indents for the tree's depths (fixed classes; the CSP allows no inline styles). */
const DEPTH_PAD = ['w-1', 'w-4', 'w-7', 'w-10', 'w-13', 'w-16'] as const;

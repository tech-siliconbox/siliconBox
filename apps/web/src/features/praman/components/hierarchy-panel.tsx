import type { TreeNode } from '../praman-snapshot';

/** The elaborated design's instances, top first; each names its module. */
export function HierarchyPanel({ tree }: { tree: TreeNode | null }) {
  if (tree === null) {
    return (
      <p className="p-3 text-[12px] text-muted-foreground">
        Elaborate the design to see its hierarchy.
      </p>
    );
  }
  return (
    <ul aria-label="Design hierarchy" className="p-2 font-mono text-[12px]">
      <TreeItem node={tree} />
    </ul>
  );
}

function TreeItem({ node }: { node: TreeNode }) {
  return (
    <li>
      <span className="block truncate px-1.5 py-0.5">
        {node.name}
        {node.name !== node.module && (
          <span className="text-muted-foreground"> ({node.module})</span>
        )}
      </span>
      {node.children.length > 0 && (
        <ul className="ml-3 border-l border-border pl-1">
          {node.children.map((child) => (
            <TreeItem key={child.path} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

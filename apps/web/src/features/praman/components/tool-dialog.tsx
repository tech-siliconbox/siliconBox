'use client';

import { type ReactNode, useId } from 'react';

/** Opens a dialog as a modal as soon as it is on the page (the tool behind it waits). */
export function openModal(node: HTMLDialogElement | null) {
  if (node !== null && !node.open) node.showModal();
}

type ToolDialogProps = { title: string; onClose: () => void; children: ReactNode };

/** A modal dialog of the tool. Escape closes it; the tool behind it waits until it does. */
export function ToolDialog({ title, onClose, children }: ToolDialogProps) {
  const heading = useId();
  return (
    <dialog
      ref={openModal}
      aria-labelledby={heading}
      onClose={onClose}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] border border-border bg-background p-0 text-[13px] text-foreground shadow-xl backdrop:bg-foreground/25"
    >
      <h2 id={heading} className="border-b border-border bg-muted px-4 py-2 font-semibold">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

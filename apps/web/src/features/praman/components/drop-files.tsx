'use client';

import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { type TextFile, readTextFiles } from '../read-files';

type DropFilesProps = {
  ref: RefObject<HTMLDivElement | null>;
  /** Adds dropped files to the session; null while there is none to add them to. */
  onDrop: ((files: TextFile[]) => Promise<unknown>) | null;
  children: ReactNode;
};

const ZONE = 'files';

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;

/** Leaving the cover shown while files are dragged over the tool is leaving the tool. */
const leavesZone = (event: DragEvent) =>
  event.target instanceof HTMLElement && event.target.dataset.drop === ZONE;

/**
 * The tool's frame: files dragged onto it from the computer are added to the session. Its drag
 * events are listened to on the element itself (they are no control of their own).
 */
export function DropFiles({ ref, onDrop, children }: DropFilesProps) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || onDrop === null) return;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setOver(true);
    };
    const leave = (event: DragEvent) => {
      if (leavesZone(event)) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setOver(false);
      void readTextFiles(Array.from(event.dataTransfer?.files ?? [])).then(onDrop);
    };
    element.addEventListener('dragover', enter);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragover', enter);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [ref, onDrop]);
  return (
    <div
      ref={ref}
      className="relative flex h-full min-h-0 flex-col border border-border bg-muted text-[13px]"
    >
      {children}
      {over && (
        <div
          data-drop={ZONE}
          className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-info bg-info-light/80 text-[15px] font-semibold text-info"
        >
          Drop the files to add them to the session
        </div>
      )}
    </div>
  );
}

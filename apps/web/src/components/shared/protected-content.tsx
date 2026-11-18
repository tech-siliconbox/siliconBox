'use client';

import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const NOTICE_MS = 4_000;
const COPYABLE = '[data-copyable]';
const BLOCKED_EVENTS = ['copy', 'cut', 'contextmenu', 'dragstart'] as const;

/** True when the whole selection sits inside a copyable element (a code example). */
function selectionIsCopyable(): boolean {
  const selection = document.getSelection();
  const inside = (node: Node | null | undefined) =>
    (node instanceof Element ? node : node?.parentElement)?.closest(COPYABLE) != null;
  return selection !== null && inside(selection.anchorNode) && inside(selection.focusNode);
}

/**
 * Copy and cut follow the selection (a keyboard copy targets wherever it started); a
 * right-click or drag follows what was clicked. Only code examples are let through.
 */
function isAllowed(event: Event): boolean {
  if (event.type === 'copy' || event.type === 'cut') return selectionIsCopyable();
  return event.target instanceof Element && event.target.closest(COPYABLE) != null;
}

/** Blocks copying out of `ref`, calling `onBlocked` each time; true while the notice shows. */
function useCopyBlock(ref: RefObject<HTMLDivElement | null>): boolean {
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const block = (event: Event) => {
      if (isAllowed(event)) return;
      event.preventDefault();
      setNotice(true);
    };
    for (const type of BLOCKED_EVENTS) element?.addEventListener(type, block);
    return () => {
      for (const type of BLOCKED_EVENTS) element?.removeEventListener(type, block);
    };
  }, [ref]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  return notice;
}

/** True while the window is out of focus, hidden, or a screenshot key was just pressed. */
function useHiddenWhileAway(): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => setHidden(false);
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'PrintScreen') hide();
    };
    const listeners: [EventTarget, string, EventListener][] = [
      [window, 'blur', hide],
      [window, 'focus', show],
      [document, 'visibilitychange', onVisibility],
      [window, 'keydown', onKey as EventListener],
      [window, 'keyup', onKey as EventListener],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
    return () => {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener);
    };
  }, []);
  return [hidden, () => setHidden(false)];
}

function CopyNotice({ visible }: { visible: boolean }) {
  return (
    <p
      role="status"
      className={cn(
        'sticky top-2 z-20 mx-auto mb-4 w-fit rounded border border-border bg-background px-3 py-1.5 text-[13px] shadow-sm print:hidden',
        !visible && 'sr-only',
      )}
    >
      {visible
        ? 'This content is copyrighted and cannot be copied. Code examples have a Copy button.'
        : ''}
    </p>
  );
}

/**
 * Paid text that cannot be selected, copied, cut, dragged, right-clicked or printed, and that
 * hides while the window is out of focus (ADR 0023). Code examples marked `data-copyable` stay
 * selectable and copyable. Deters casual copying; the watermarks are what trace a leak.
 */
export function ProtectedContent({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const notice = useCopyBlock(ref);
  const [hidden, reveal] = useHiddenWhileAway();
  return (
    <div ref={ref} data-protected="" className="relative select-none **:data-copyable:select-text">
      <CopyNotice visible={notice} />
      <p className="hidden text-[14px] print:block">
        This content is copyrighted. Printing and saving it are not allowed.
      </p>
      <div
        aria-hidden={hidden}
        className={cn('transition-[filter] print:hidden', hidden && 'blur-md')}
      >
        {children}
      </div>
      {hidden && (
        <button
          type="button"
          onClick={reveal}
          className="absolute inset-0 z-10 flex items-start justify-center pt-24 text-[14px] font-semibold print:hidden"
        >
          Content hidden while this window is not active. Click to keep reading.
        </button>
      )}
    </div>
  );
}

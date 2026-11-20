import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SESSION_SCRIPT } from '../abilities';

/** A command or file name in running text. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] bg-muted px-1 py-px font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}

function Guide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl p-5 text-[13px] leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">{title}</p>
      {children}
    </div>
  );
}

/** With no session chosen: start one (the File menu also lists the saved ones). */
export function NoSessionGuide({ onNew }: { onNew: () => void }) {
  return (
    <Guide title="Start a session to use Praman.">
      <p className="mt-2">
        A session keeps your files, commands, results and log; it opens again from where you left
        it. File &gt; Sessions… lists the ones you keep.
      </p>
      <div className="mt-4">
        <Button size="sm" onClick={onNew}>
          New Session
        </Button>
      </div>
    </Guide>
  );
}

type DesignGuideProps = { files: number; onAdd: () => void; onExample: () => void };

/** Until a design is elaborated, the property table explains how to get there. */
export function DesignGuide({ files, onAdd, onExample }: DesignGuideProps) {
  return (
    <Guide title="The property table fills when a design is elaborated.">
      <ol className="mb-4 ml-5 mt-2 list-decimal">
        <li>
          {files > 0
            ? `${files} file${files === 1 ? ' is' : 's are'} in the session.`
            : 'Add the design, SVA and Tcl files (File > Add Files).'}
        </li>
        <li>
          Run the script: <b className="text-foreground">Run Script</b>, or{' '}
          <Code>source {SESSION_SCRIPT}</Code> in the console (a <Code>{SESSION_SCRIPT}</Code> is
          written for uploaded design and SVA files; check its top, clock and reset). Or type the
          commands one by one: <Code>analyze -sv design.sv</Code>,{' '}
          <Code>elaborate -top design</Code>, <Code>clock clk</Code>, <Code>reset !rst_n</Code>,{' '}
          <Code>prove -all</Code>.
        </li>
      </ol>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onAdd}>
          Add Files…
        </Button>
        <Button size="sm" variant="secondary" onClick={onExample}>
          Load Example Files
        </Button>
      </div>
    </Guide>
  );
}

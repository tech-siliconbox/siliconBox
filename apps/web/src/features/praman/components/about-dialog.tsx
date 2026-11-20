import { type PramanCeilings, TOOL_RETENTION_DAYS } from '@siliconbox/shared';
import { Button } from '@/components/ui/button';
import { ToolDialog } from './tool-dialog';

type AboutDialogProps = { ceilings: PramanCeilings; onClose: () => void };

/** What Praman is, and how far the learner's level lets a proof go. */
export function AboutDialog({ ceilings, onClose }: AboutDialogProps) {
  return (
    <ToolDialog title="About Praman" onClose={onClose}>
      <div className="flex flex-col gap-3 leading-relaxed">
        <p>
          Praman is SiliconBox&apos;s formal tool: your own design and SVA files, analyzed,
          elaborated and proven with open-source engines, driven by menus or Tcl commands.
        </p>
        <p>
          For your level each proof runs up to {ceilings.proofSeconds / 60} minutes and its traces
          reach {ceilings.traceLength} cycles; you have {ceilings.dailySeconds / 60} proof minutes a
          day. Sessions and run history are kept for {TOOL_RETENTION_DAYS} days after you last use
          them.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ToolDialog>
  );
}

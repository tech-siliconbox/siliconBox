import type { LessonBlock } from '@siliconbox/shared';
import { TextBody } from './prose';

type TableBlock = Extract<LessonBlock, { blockType: 'table' }>;

const CELL = 'border-b border-border px-3 py-2 text-left align-top';

/** A lesson table: one header row, then body rows; cells use the lesson text format. */
export function LessonTable({ block }: { block: TableBlock }) {
  return (
    <div className="mb-5 overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-[14px]">
        <thead className="bg-muted">
          <tr>
            {block.columns.map((column, index) => (
              <th key={index} scope="col" className={`${CELL} font-semibold`}>
                {column.text && <TextBody text={column.text} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="last:[&>td]:border-b-0">
              {row.cells.map((cell, index) => (
                <td key={index} className={CELL}>
                  {cell.text && <TextBody text={cell.text} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

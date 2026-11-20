import { cn } from '@/lib/cn';
import type { MenuItem } from '../menus';
import type { PramanProperty } from '../praman-snapshot';
import { PROPERTY_LOOK } from '../property-status';
import { ReportTable } from './report-parts';
import { RowMenu } from './row-menu';

type PropertyTableProps = {
  properties: PramanProperty[];
  onTrace: (property: PramanProperty) => void;
  /** Each row's own menu, and what choosing an item does. */
  menuOf: (property: PramanProperty) => (MenuItem | null)[];
  onChoose: (item: MenuItem) => void;
};

const HEAD = ['Property', 'Type', 'Result', 'Bound', 'Engine', 'Time', 'Actions'];

/** The elaborated design's properties with each one's result, as Praman's property table. */
export function PropertyTable({ properties, ...row }: PropertyTableProps) {
  return (
    <ReportTable head={HEAD}>
      {properties.map((property) => (
        <PropertyRow key={property.id} property={property} {...row} />
      ))}
    </ReportTable>
  );
}

function PropertyRow({
  property,
  onTrace,
  menuOf,
  onChoose,
}: Omit<PropertyTableProps, 'properties'> & { property: PramanProperty }) {
  const look = PROPERTY_LOOK[property.status];
  return (
    <tr className={cn((property.related !== '' || property.disabled) && 'text-muted-foreground')}>
      <td className="px-3 py-1.5 font-mono" title={property.detail || undefined}>
        {property.name}
        {property.disabled && <span className="ml-2 font-sans text-[11px]">(disabled)</span>}
      </td>
      <td className="px-3 py-1.5">{property.type}</td>
      <td className="px-3 py-1.5">
        <span
          className={cn(
            'rounded border px-2 py-0.5 font-mono text-[11px] font-bold',
            look.className,
          )}
        >
          {look.label}
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono">{property.bound ?? ''}</td>
      <td className="px-3 py-1.5">{property.engine}</td>
      <td className="px-3 py-1.5 font-mono">
        {property.seconds === null ? '' : `${property.seconds.toFixed(1)} s`}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right">
        {property.has_trace && (
          <button
            type="button"
            onClick={() => onTrace(property)}
            className="mr-2 text-[12px] font-semibold underline underline-offset-2"
          >
            Waveform
          </button>
        )}
        <RowMenu name={property.name} items={menuOf(property)} onChoose={onChoose} />
      </td>
    </tr>
  );
}

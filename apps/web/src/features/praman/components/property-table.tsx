import { cn } from '@/lib/cn';
import type { PramanProperty } from '../praman-snapshot';
import { PROPERTY_LOOK } from '../property-status';

type PropertyTableProps = {
  properties: PramanProperty[];
  onTrace: (property: PramanProperty) => void;
};

/** The elaborated design's properties with each one's result, as Praman's property table. */
export function PropertyTable({ properties, onTrace }: PropertyTableProps) {
  if (properties.length === 0) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        Elaborate the design to list its assertions, assumptions and covers here.
      </p>
    );
  }
  return (
    <table className="w-full text-left text-[13px] [&_tbody_tr:nth-child(even)]:bg-muted/40">
      <thead className="sticky top-0 border-b border-border bg-muted text-[12px] text-muted-foreground">
        <tr>
          <th className="px-3 py-1.5 font-semibold">Property</th>
          <th className="px-3 py-1.5 font-semibold">Type</th>
          <th className="px-3 py-1.5 font-semibold">Result</th>
          <th className="px-3 py-1.5 font-semibold">Bound</th>
          <th className="px-3 py-1.5 font-semibold">Engine</th>
          <th className="px-3 py-1.5 font-semibold">Time</th>
          <th className="px-3 py-2">
            <span className="sr-only">Trace</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {properties.map((property) => (
          <PropertyRow key={property.id} property={property} onTrace={onTrace} />
        ))}
      </tbody>
    </table>
  );
}

function PropertyRow({
  property,
  onTrace,
}: {
  property: PramanProperty;
  onTrace: PropertyTableProps['onTrace'];
}) {
  const look = PROPERTY_LOOK[property.status];
  return (
    <tr className={cn(property.related !== '' && 'text-muted-foreground')}>
      <td className="px-3 py-1.5 font-mono" title={property.detail || undefined}>
        {property.name}
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
      <td className="px-3 py-1.5 text-right">
        {property.has_trace && (
          <button
            type="button"
            onClick={() => onTrace(property)}
            className="text-[12px] font-semibold underline underline-offset-2"
          >
            Waveform
          </button>
        )}
      </td>
    </tr>
  );
}

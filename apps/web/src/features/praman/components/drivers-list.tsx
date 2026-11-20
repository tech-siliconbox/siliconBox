import type { Drivers } from '../praman-reports';

/** What set a signal's value at a cycle: each driving statement, with the values it read. */
export function DriversList({ drivers }: { drivers: Drivers }) {
  return (
    <section aria-label="Drivers" className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="font-mono text-[13px] font-semibold">
        {drivers.signal} = {drivers.value} at cycle {drivers.cycle}
      </h3>
      {drivers.error !== '' && <p className="text-[13px] text-danger">{drivers.error}</p>}
      {drivers.drivers.map((driver) => (
        <div
          key={`${driver.file}:${driver.line}`}
          className="rounded-[3px] border border-border p-2 text-[13px]"
        >
          <p className="text-[12px] text-muted-foreground">
            {driver.file}:{driver.line} · {driver.kind}
            {driver.clocked &&
              driver.values_at !== null &&
              ` · values at cycle ${driver.values_at}`}
          </p>
          <pre className="my-1 whitespace-pre-wrap font-mono text-[12px]">{driver.text}</pre>
          {Object.keys(driver.values).length > 0 && (
            <p className="font-mono text-[12px]">
              {Object.entries(driver.values)
                .map(([signal, value]) => `${signal} = ${value}`)
                .join(' · ')}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

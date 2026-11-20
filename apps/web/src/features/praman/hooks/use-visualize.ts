'use client';

import { useEffect, useRef, useState } from 'react';
import { type PramanTrace, readPramanTrace as readTrace } from '../praman-trace';
import { type Pin, type TraceAnalysis, askWhatIf } from '../trace-tools';
import { type Cycles, type Radix, type Row, defaultRows, stepRow } from '../visualize';

const LABEL_WIDTH = 300;
const [MIN_ZOOM, MAX_ZOOM] = [6, 160];

/** A trace a what-if found, shown instead of the property's own, and how it was asked for. */
type Edited = { trace: PramanTrace; job: string; label: string };

/** Visualize's what-if: pinned values, another counterexample, the quietest trace. */
export function useWhatIf(original: PramanTrace, analysis: TraceAnalysis | undefined) {
  const [edited, setEdited] = useState<Edited | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  // A value being pinned: the selected signal at the cursor, its value still to edit.
  const [draft, setDraft] = useState<Pin | null>(null);
  const [status, setStatus] = useState({ busy: false, message: '' });
  const run = async (
    ask: { pins?: Pin[]; quiet?: boolean; differFrom?: string },
    label: string,
  ) => {
    if (analysis === undefined) return;
    setStatus({ busy: true, message: '' });
    const answer = await askWhatIf(analysis.sessionId, { property: analysis.property, ...ask });
    if (!answer.ok) {
      setStatus({ busy: false, message: answer.message });
      return;
    }
    const { trace, message, job_id: job } = answer.value;
    const found = trace === null ? null : readTrace(trace);
    setStatus({ busy: false, message: found === null ? message || 'No trace was found.' : '' });
    if (found !== null) setEdited({ trace: found, job, label });
  };
  return {
    shown: edited?.trace ?? original,
    edited,
    pins,
    setPins,
    draft,
    setDraft,
    status,
    prove: () => void run({ pins }, 'What-if trace'),
    another: () =>
      void run({ pins, differFrom: edited?.job ?? original.jobId }, 'Another counterexample'),
    quiet: () => void run({ quiet: true }, 'Quiet trace'),
    original: () => setEdited(null),
  };
}
export type WhatIf = ReturnType<typeof useWhatIf>;

/** The view of one trace: its rows, the chosen row, the cursor, the zoom and the radix. */
export function useView(cycles: Cycles, trace: PramanTrace, top: string) {
  const fail = trace.failCycle === null ? null : Math.min(trace.failCycle, cycles.count - 1);
  const [rows, setRows] = useState<Row[]>(() => defaultRows(cycles, trace.debug, top));
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(fail ?? 0);
  // The second cursor (Shift+click): the cycles between the two show beside the cursor.
  const [marker, setMarker] = useState<number | null>(null);
  const [zoom, setZoom] = useState(40);
  const [radix, setRadix] = useState<Radix>('hex');
  const waves = useFit(cycles.count, setZoom);
  const fit = () => setZoom(fitZoom(waves.current?.clientWidth ?? 900, cycles.count));
  // The waves' element goes to the table alone: the rest of the view is plain state.
  const view = {
    fail,
    rows,
    setRows,
    selected,
    setSelected,
    cursor,
    moveCursor: (cycle: number) => setCursor(Math.max(0, Math.min(cycles.count - 1, cycle))),
    marker,
    setMarker,
    /** Moves the chosen row one place up or down. */
    stepChosen: (step: 1 | -1) => selected !== null && setRows(stepRow(rows, selected, step)),
    /** Removes the chosen row (not one of the property's own conditions). */
    removeChosen: () => setRows(rows.filter((row) => row.key !== selected || row.kind === 'cond')),
    zoom,
    zoomBy: (factor: number) => setZoom(clampZoom(Math.round(zoom * factor))),
    fit,
    radix,
    setRadix,
  };
  return { view, waves };
}
export type View = ReturnType<typeof useView>['view'];

const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
const fitZoom = (width: number, count: number) =>
  clampZoom(Math.floor((width - LABEL_WIDTH - 24) / Math.max(1, count)));

/** Fits the whole trace to the waves' width once they are on the page. */
function useFit(count: number, setZoom: (zoom: number) => void) {
  const waves = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = waves.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setZoom(fitZoom(entry.contentRect.width, count));
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, setZoom]);
  return waves;
}

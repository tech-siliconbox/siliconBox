import {
  CONTENT_MONTHS,
  LEVEL_LABELS,
  LEVEL_PRICE_PAISE,
  type Level,
  TOOL_WINDOW_MONTHS,
  formatInr,
  levelsUpTo,
} from '@siliconbox/shared';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function LevelCard({ level }: { level: Level }) {
  const opens = levelsUpTo(level).map((opened) => LEVEL_LABELS[opened]);
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{LEVEL_LABELS[level]}</h2>
        <Badge variant={level === 'advance' ? 'inverted' : 'muted'}>
          {opens.length} of 3 levels
        </Badge>
      </div>
      <p className="font-mono text-3xl font-bold tracking-tight">
        {formatInr(LEVEL_PRICE_PAISE[level])}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Opens</dt>
        <dd className="text-right">{opens.join(', ')}</dd>
        <dt className="text-muted-foreground">Lessons and Drills</dt>
        <dd className="text-right">{CONTENT_MONTHS[level]} months</dd>
        <dt className="text-muted-foreground">Formal tool</dt>
        <dd className="text-right">{TOOL_WINDOW_MONTHS} months</dd>
      </dl>
    </Card>
  );
}

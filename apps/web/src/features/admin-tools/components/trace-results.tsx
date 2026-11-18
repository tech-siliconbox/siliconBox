import type { TraceMatch } from '@/server/watermark-trace';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';

function MatchCard({ match }: { match: TraceMatch }) {
  return (
    <li className="rounded-card border border-border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="muted">
          {match.source === 'invisible' ? 'Hidden mark' : 'Visible mark'}
        </Badge>
        <span className="font-mono text-[12px]">{match.clue}</span>
      </div>
      {match.learners.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No account matches this mark.</p>
      ) : (
        <ul className="divide-y divide-border text-[13px]">
          {match.learners.map((learner) => (
            <li key={learner.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
              <span className="font-semibold">{learner.email}</span>
              {learner.name && <span>{learner.name}</span>}
              <span className="font-mono text-[11px] text-muted-foreground">id {learner.id}</span>
              {learner.createdAt && (
                <span className="text-muted-foreground">
                  joined {learner.createdAt.slice(0, 10)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** What the trace found: each mark in the pasted text and the accounts it points to. */
export function TraceResults({ matches }: { matches: TraceMatch[] }) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title="No watermark found"
        description="The text carries no hidden code and no visible mark. Hand-typed copies and cropped screenshots can lose both."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {matches.map((match) => (
        <MatchCard key={match.clue} match={match} />
      ))}
    </ul>
  );
}

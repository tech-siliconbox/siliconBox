import { type QuestionQuery, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** A plain GET form: searching needs no client JavaScript. */
export function QuestionSearch({ query }: { query: QuestionQuery }) {
  const filtered =
    query.q !== undefined || query.topic !== undefined || query.company !== undefined;
  return (
    <form role="search" action={ROUTES.questions} className="flex flex-wrap items-center gap-2">
      <label htmlFor="question-search" className="sr-only">
        Search questions
      </label>
      <input
        id="question-search"
        name="q"
        type="search"
        defaultValue={query.q}
        maxLength={100}
        placeholder="Search questions"
        className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm focus-visible:border-foreground"
      />
      {query.topic !== undefined && <input type="hidden" name="topic" value={query.topic} />}
      {query.company !== undefined && <input type="hidden" name="company" value={query.company} />}
      <Button type="submit">Search</Button>
      {filtered && (
        <Link href={ROUTES.questions} className="text-sm text-link-idle hover:text-link-hover">
          Clear
        </Link>
      )}
    </form>
  );
}

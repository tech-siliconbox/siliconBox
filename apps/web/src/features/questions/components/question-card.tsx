import { type PublicQuestion, ROUTES } from '@siliconbox/shared';
import { CompanyTag } from '@/components/shared/company-tag';
import { Badge } from '@/components/ui/badge';
import { questionsHref } from '../questions-href';
import { SiteLink } from '@/components/ui/site-link';

export function QuestionCard({ question }: { question: PublicQuestion }) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border p-5">
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{question.text}</p>
      {question.companies.length > 0 && (
        <ul aria-label="Asked at" className="flex flex-wrap gap-2">
          {question.companies.map((company) => (
            <li key={`${company.slug}-${company.year}`}>
              <SiteLink
                href={questionsHref({ company: company.slug })}
                className="inline-flex items-center gap-1.5"
              >
                <CompanyTag name={company.name} />
                <span className="font-mono text-[11px] text-muted-foreground">{company.year}</span>
              </SiteLink>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {question.topics.map((topic) => (
          <SiteLink key={topic} href={questionsHref({ topic })}>
            <Badge>{topic}</Badge>
          </SiteLink>
        ))}
        <SiteLink
          href={ROUTES.question(question.slug)}
          className="ml-auto text-[12px] underline underline-offset-4"
        >
          Read the answer (active access)
        </SiteLink>
      </div>
    </article>
  );
}

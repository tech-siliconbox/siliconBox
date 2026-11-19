import 'server-only';
import {
  ASSESSMENT_ATTEMPTS,
  assessmentAnchor,
  type AssessmentQuestion,
  type KeyAnswer,
  OPTION_LETTERS,
} from '@siliconbox/shared';
import { Eyebrow } from '@/components/ui/eyebrow';
import { AssessmentForm } from '@/features/assessments/components/assessment-form';
import { cn } from '@/lib/cn';
import { type AssessmentView, readAssessmentView } from '@/server/assessments';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { InlineCourseHtml } from './course-html';

/** Where the learner stands, in one line. */
function standingText({ assessment, attempts, standing }: AssessmentView): string {
  const total = assessment.questions.length;
  const last = attempts.at(-1);
  if (standing.passed) return `You passed with ${standing.best} of ${total}.`;
  if (standing.finished) {
    return `You used all ${ASSESSMENT_ATTEMPTS} attempts. Your best score is ${standing.best} of ${total}.`;
  }
  const intro = `${total} questions. Pass with ${assessment.passMark}. ${standing.attemptsLeft} of ${ASSESSMENT_ATTEMPTS} attempts left.`;
  return last === undefined ? intro : `Last attempt: ${last.score} of ${total}. ${intro}`;
}

/** The question's own text, numbered. */
function QuestionText({
  question,
  index,
  id,
}: {
  question: AssessmentQuestion;
  index: number;
  id?: string;
}) {
  return (
    <p id={id} className="flex gap-2 text-[15px] text-foreground">
      <span className="font-mono text-muted-foreground">{index + 1}.</span>
      <InlineCourseHtml html={question.html} className="text-foreground" />
    </p>
  );
}

/** The questions as radio groups, grouped under their topics, inside the attempt form. */
function Questions({ questions }: { questions: AssessmentQuestion[] }) {
  return questions.map((question, index) => (
    <fieldset key={index} aria-labelledby={`q${index}-text`} className="flex flex-col gap-2">
      {question.topic && question.topic !== questions[index - 1]?.topic && (
        <Eyebrow className="mt-4">{question.topic}</Eyebrow>
      )}
      <QuestionText question={question} index={index} id={`q${index}-text`} />
      {question.options.map((option, choice) => (
        <label key={choice} className="flex cursor-pointer items-baseline gap-2 pl-6 text-sm">
          <input type="radio" name={`q${index}`} value={choice} required />
          <span className="font-mono">{OPTION_LETTERS[choice]})</span>
          <InlineCourseHtml html={option.html} className="text-foreground" />
        </label>
      ))}
    </fieldset>
  ));
}

/** After the last attempt or a pass: each answer given, the right one, and why. */
function Review({ view, review }: { view: AssessmentView; review: KeyAnswer[] }) {
  const best = Math.max(...view.attempts.map((attempt) => attempt.score));
  const shown = view.attempts.findLast((attempt) => attempt.score === best);
  return (
    <ol className="flex flex-col gap-6">
      {view.assessment.questions.map((question, index) => {
        const right = OPTION_LETTERS.indexOf(review[index]?.correct ?? 'A');
        const chosen = shown?.answers[index];
        const why = review[index]?.why;
        return (
          <li key={index} className="flex flex-col gap-2">
            <QuestionText question={question} index={index} />
            <ul className="flex flex-col gap-1 pl-6 text-sm">
              {question.options.map((option, choice) => (
                <li
                  key={choice}
                  className={cn(
                    choice === right && 'font-medium text-ok',
                    choice === chosen && choice !== right && 'text-danger',
                  )}
                >
                  {OPTION_LETTERS[choice]}){' '}
                  <InlineCourseHtml html={option.html} className="text-inherit" />
                  {choice === right && ' ✓ correct'}
                  {choice === chosen && choice !== right && ' ✕ your answer'}
                </li>
              ))}
            </ul>
            {why && <InlineCourseHtml html={why} className="pl-6 text-sm" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A graded assessment inside a module's page (ADR 0029): answered here, scored on the server.
 * Right answers and explanations show only once the learner passed or used every attempt.
 */
export async function AssessmentEmbed({ slug }: { slug: string }) {
  const view = await readAssessmentView(await requirePageIdentity(), slug);
  if (view === null) return null;
  const { assessment, attempts, review } = view;
  return (
    <section
      id={assessmentAnchor(slug)}
      aria-label={`Assessment: ${assessment.title}`}
      className="my-8 scroll-mt-20 overflow-hidden rounded-card border border-border bg-background"
    >
      <header className="flex flex-col gap-1 border-b border-border px-4 py-4 sm:px-6">
        <Eyebrow>Assessment · graded</Eyebrow>
        <h3 className="text-xl font-bold tracking-tight">{assessment.title}</h3>
        <p role="status" className="text-sm text-muted-foreground">
          {standingText(view)}
        </p>
      </header>
      <div className="px-4 py-5 sm:px-6">
        {review === null ? (
          <AssessmentForm
            assessmentId={assessment.publicId}
            questionCount={assessment.questions.length}
            attempt={{ number: attempts.length + 1, of: ASSESSMENT_ATTEMPTS }}
            anchor={assessmentAnchor(slug)}
          >
            <Questions questions={assessment.questions} />
          </AssessmentForm>
        ) : (
          <Review view={view} review={review} />
        )}
      </div>
    </section>
  );
}

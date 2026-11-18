'use client';

import { FEEDBACK_MAX_LENGTH, type RubricItem, rubricTotal } from '@siliconbox/shared';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextAreaField } from '@/components/ui/text-area-field';
import { TextField } from '@/components/ui/text-field';
import type { StoredGrade } from '@/db/capstone-submissions';
import type { GradeState, gradeCapstoneAction } from '@/server/capstone-grade-action';

type CapstoneGradeFormProps = {
  action: typeof gradeCapstoneAction;
  submission: string;
  rubric: RubricItem[];
  grade: StoredGrade | null;
  passMark: number;
};

/** A score for each rubric criterion and feedback for the learner; saving again corrects it. */
export function CapstoneGradeForm({
  action,
  submission,
  rubric,
  grade,
  passMark,
}: CapstoneGradeFormProps) {
  const [state, submit, pending] = useActionState<GradeState, FormData>(action, { status: 'idle' });
  return (
    <form action={submit} className="flex flex-col gap-4">
      <input type="hidden" name="submission" value={submission} />
      {rubric.map((item, index) => (
        <TextField
          key={item.criterion}
          label={`${item.criterion} (out of ${item.points})`}
          name="score"
          type="number"
          min={0}
          max={item.points}
          step={1}
          required
          defaultValue={grade?.scores[index]}
        />
      ))}
      <p className="text-sm text-muted-foreground">
        Out of {rubricTotal(rubric)}; {passMark} passes.
      </p>
      <TextAreaField
        label="Feedback for the learner"
        name="feedback"
        rows={8}
        required
        maxLength={FEEDBACK_MAX_LENGTH}
        defaultValue={grade?.feedback}
      />
      <FormError message={state.status === 'error' ? state.message : null} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Saving…' : grade === null ? 'Save grade' : 'Update grade'}
      </Button>
    </form>
  );
}

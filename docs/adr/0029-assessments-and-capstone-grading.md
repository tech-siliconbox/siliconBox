# 0029. Graded assessments and capstone projects

- Status: Accepted (founder, 2026-11-19)
- Date: 2026-11-19

## Context

A course ends with a 30-question multiple-choice assessment (pass 24 of 30) and a capstone
project scored on a 100-point rubric (pass 70). Both were plain text on the last module's page,
with the answer key printed under the questions, so nothing was graded and the key was readable
by anyone with access. The founder decided (2026-11-19): grade both from within the module's
page; at most 3 attempts at the assessment, with no waiting between them; capstones are a .zip
upload, scored and commented on by our industry experts, who are admins; a learner passes the
course with both passed. A results page (Performance) shows where each learner stands.

## Decision

- **Assessments.** Questions live in a CMS collection, `assessments` (one per module that has
  one, published like lessons), shown in the page as the author wrote them. The answer key lives
  in its own collection, `assessment_keys`, which the site's database user cannot read; only the
  grader user (ADR 0021) reads it. The page embeds the assessment with an `assessmentEmbed`
  block. A learner answers every question and submits; the server scores the attempt against the
  key and stores it. Attempts are capped at 3 in one atomic write per learner and assessment.
  The API returns only the score; correct answers and explanations appear in the page (golden
  rule, ADR 0027), and only once the learner has passed or used every attempt.
- **Capstones.** The rubric lives in `capstones` (CMS), shown in the page by a `capstoneEmbed`
  block with the upload. A learner uploads one .zip of up to 10 MB, checked by its bytes. It is
  kept in MongoDB (`capstone_files`, one document per submission) until object storage exists;
  `capstone_submissions` holds the rest. A learner has at most one submission waiting for review;
  a new upload replaces it. After a failing grade they may submit a new version; after a pass,
  none.
- **Grading capstones.** Editors and Owners grade at `/admin-tools/capstones`: download the
  .zip, score each rubric criterion and write feedback. The learner sees the scores and feedback
  in the page and on Performance. Each grade is audit-logged (`capstone_graded`).
- **Conversion.** The course converter turns an assessment section (questions in `<ol>`, options
  `A)` to `D)`, an answer-key table) into the assessment and its key, and a rubric table
  (Criterion, Points, What earns full marks) into the capstone, each replaced in the page by its
  block. Re-importing a course therefore never brings the key back into the page.

## Consequences

- The answer key is no longer readable by learners or by the site's own database user.
- Capstone files count against the database's storage until object storage exists; 10 MB per
  submission keeps a document well under MongoDB's 16 MB limit.
- New collections need role grants (`infra/mongodb/roles.json`) and a migration for indexes.

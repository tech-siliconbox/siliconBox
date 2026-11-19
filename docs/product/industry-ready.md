# Industry Ready

A separate tab listing career services as cards. Each service is a document with a `status` of `open` or `locked` that an admin flips, so unlocking needs no deploy.

| Service | Status today | Access rule |
| --- | --- | --- |
| Resume Builder | Open | Free for learners with an active content entitlement |
| CV screening | Open | Free for learners with an active content entitlement |
| Interview prep | Locked | Not decided how to build |
| Coaching and mentorship | Locked | Not decided how to build |
| Mock interview | Locked | Not decided how to build |

## Rules

- Locked services refuse every call, not only hide the button.
- When a service becomes paid, it gets its own entitlement kind.
- Resume Builder and CV screening hold personal data (CVs): per-user storage, a delete button, rate limits, and no use of the data beyond the service.
- They lock when the learner's last content window ends.

## Built (2026-10-02)

- **Resume Builder:** structured editor with live preview; Classic and Compact single-column templates; text PDF generated on the server so applicant tracking systems can read it; save and delete. (Extended in Phase C, below.)
- **CV screening:** upload a PDF or Word file; the text is read in memory and the file discarded; a rule-based report scores ATS readability, contact details, sections, length, impact and formal verification keywords, with specific fixes; reports are kept until the learner deletes them.
- Both are open in the admin's Services list; switching one to locked refuses every call at once.

## Job match and resume check (2026-11-19)

Phase A of the upgrade planned with ADR 0030 (rule-based, no AI, no new vendor):

- **Job match:** CV screening takes an optional pasted job description and shows how much of what it asks for the CV shows, as a separate percentage beside the unchanged score. It matches on a fixed list of formal verification and hardware terms, counts terms under the posting's requirements for more, skips its offer part (pay, perks), and lists the missing terms most-wanted first. The job description is not stored; the match result is, with the report.
- **What an ATS reads:** after a screening, the text read from the file is shown once (not stored), so the learner can see missing or out-of-order words.
- **Check this resume:** the Resume Builder's "Check resume" screens the saved resume's own PDF the same way, with the same optional job match. Nothing is stored.

## CVs kept, and AI feedback (2026-11-19)

Phase B (ADR 0030):

- **CVs stored per user** (founder, 2026-11-19): each uploaded CV is kept with its report for the learner's newest 5 CVs, downloadable from the report list, and deleted with its report or the account.
- **AI feedback:** on a saved report, the learner reads a notice (what is sent, to whom, where, for how long, not used for training), ticks their agreement and asks. Claude returns a summary, rewrites of specific lines, strengths and, with a job description, fit and gaps. It never scores. The answer is checked on the server before it is kept with the report. Each learner may ask 5 times a day and 30 a month; failures do not count.
- **Off until switched on:** without `ANTHROPIC_API_KEY` the AI option shows as "Coming soon". The key is set only after the privacy notice names Anthropic.

## Resume Builder, industry feature set (2026-11-19)

Phase C, modelled on the feature set of Reactive Resume (MIT), the most-used open-source builder; no code was copied. Everything works without AI:

- **Several resumes** per learner (up to 5), for different kinds of role: switch, rename, new, duplicate, delete. Saves itself a moment after typing stops and on Ctrl/Cmd+S, with undo and redo and a warning before leaving unsaved edits.
- **Sections:** summary, skills, experience, projects, education, certifications, awards and achievements, publications, languages, and up to 3 of the learner's own (such as positions of responsibility). Each can be renamed, hidden and reordered. Bullets and the summary take **bold** and *italic*.
- **Design:** four single-column, ATS-safe templates (Classic, Compact, Modern, Minimal), sans or serif, 9 to 12 pt, spacing, margins, six dark accent colours, A4 or US Letter. Preview, PDF and Word follow the same settings.
- **Download:** PDF (text, for applying), Word (.docx, for recruiters who ask), JSON Resume (backup, and portable to other tools) and Markdown.
- **Import:** a JSON Resume file, or a LinkedIn data export (.zip); each becomes a new resume.
- **Check:** the resume's own PDF screened like an uploaded CV, with the job match.
- **AI (built, shown as "Coming soon" until the key is set):** tailor a resume to a job (proposals the learner accepts one by one; skills only if the resume already shows them; gaps from the posting), and read a PDF or Word CV into the builder.

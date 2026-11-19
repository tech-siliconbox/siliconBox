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

- **Resume Builder:** structured editor with live preview; Classic and Compact single-column templates; text PDF generated on the server so applicant tracking systems can read it; save and delete.
- **CV screening:** upload a PDF or Word file; the text is read in memory and the file discarded; a rule-based report scores ATS readability, contact details, sections, length, impact and formal verification keywords, with specific fixes; reports are kept until the learner deletes them.
- Both are open in the admin's Services list; switching one to locked refuses every call at once.

## Job match and resume check (2026-11-19)

Phase A of the upgrade planned with ADR 0030 (rule-based, no AI, no new vendor):

- **Job match:** CV screening takes an optional pasted job description and shows how much of what it asks for the CV shows, as a separate percentage beside the unchanged score. It matches on a fixed list of formal verification and hardware terms, counts terms under the posting's requirements for more, skips its offer part (pay, perks), and lists the missing terms most-wanted first. The job description is not stored; the match result is, with the report.
- **What an ATS reads:** after a screening, the text read from the file is shown once (not stored), so the learner can see missing or out-of-order words.
- **Check this resume:** the Resume Builder's "Check resume" screens the saved resume's own PDF the same way, with the same optional job match. Nothing is stored.

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

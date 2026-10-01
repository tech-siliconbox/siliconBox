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

# Question bank

Interview questions that real companies have asked (for example Infineon, Qualcomm).

## Public and paid parts

- Public to everyone: question text, topic tags, company tags, year.
- Paid (active content entitlement): the answer.

## Company tags

- Each company is shown as its **logo plus its name beside it**.
- A question can carry several companies.
- Companies live in one list (`companies`: name, slug, logo file). Uploading a logo once updates every question.
- Tag only what the author can stand behind. Keep a year and a source note for each tag.
- Logos are trademarks: check each company's usage terms or get permission before publishing its logo. Until then, show the name only. See `docs/legal/trademark-and-logos.md`.

## Search

A MongoDB text index over public question text. Atlas Search is not on the free tier. No public index over paid content.

# Component and helper catalog

Check here before writing a component, hook or helper. Add a row when you create one; remove it when you delete one. Keep it accurate; a stale catalog causes duplicates. Paths are under `apps/web/src/` unless they start with `packages/`.

## UI primitives (`components/ui`)

| Name | Purpose | Status |
| --- | --- | --- |
| Button, `buttonVariants` | Actions; `primary`/`secondary`, `lg`/`md`/`sm`. Use `buttonVariants` to style a `Link` | Built |
| Badge | Small mono label (`outline`, `muted`, `inverted`) | Built |
| Card | Bordered surface, no shadow | Built |
| Eyebrow | Mono uppercase label above headings | Built |
| Field, TextField, TextAreaField | Label plus control; input and textarea share one wrapper | Built |
| CspImage | `next/image` without the inline style the CSP blocks; use it instead of `next/image` | Built |
| Tabs | Tab list and panels | Planned |
| Dialog | Modal | Planned |
| Table | Data table | Planned |
| Skeleton | Loading placeholder | Planned |

## Shared components (`components/shared`)

| Name | Purpose | Status |
| --- | --- | --- |
| PageShell | Header (with an `headerActions` slot), main, footer | Built |
| SiteHeader, SiteFooter | Nav and footer used by PageShell | Built |
| BrandMark | Logo icon with "SiliconBox" as live text | Built |
| GuestActions | Sign in / Get started header actions | Built |
| NAV_LINKS | Main sections, shared by header and footer (`components/shared/nav-links.ts`) | Built |
| Watermarked | Tiles the visible mark over content (SVG, no inline styles). The invisible text pattern comes with lesson rendering in phase 2 | Built |
| LockedCard | Locked state for services and levels, with the reason | Built |
| CompanyTag | Company name, with the logo once permission is confirmed | Built |
| EmptyState | Standard empty display | Built |
| ErrorState | Standard error display (used by the site's `error.tsx`) | Built |
| PaidContentLocked | Why a lesson or answer is locked, with the way forward | Built |
| SessionGuard | Re-checks the session every minute and on focus; sends the learner to sign-in with the reason | Built |
| LessonBlockRenderer | Renders lesson blocks on the server (`components/lesson`); diagrams go through `sanitizeSvg` | Built |
| Prose | Text with `backtick` spans as inline code (`components/lesson`) | Built |

## Hooks (`hooks`)

| Name | Purpose | Status |
| --- | --- | --- |
| useSessionCheck | Periodic session validity check against `GET /api/v1/me` | Built |
| useRunPolling | Poll a Drill run with 1 s, 2 s, 5 s backoff | Planned |

## Feature parts (`features/<name>`)

| Name | Purpose | Status |
| --- | --- | --- |
| auth: AuthForm, useAuthAction, AuthPanel, FormError, formValue | Shared frame, submit and error handling for sign-in and sign-up | Built |
| auth: SignInForm, SignUpForm, GoogleButton, SignOutButton | The auth actions | Built |
| auth: TwoFactorSettings, EnableTwoFactor, TwoFactorChallengeForm, TotpQrCode, PasswordField | Two-factor setup, sign-in code step and turning it off | Built |
| courses: CourseOutlineView, CourseLevelBadge | Public outline: modules and lesson titles only, done marks for signed-in learners | Built |
| questions: QuestionCard, QuestionSearch, questionsHref | Public question bank list, GET search form, filter links | Built |
| progress: MarkDoneButton | Marks a lesson done or not done | Built |
| industry-ready: ServiceCard | Open or locked service card; links only to built services | Built |
| industry-ready: CareerToolLocked | Why a career tool is unavailable, with the next step | Built |
| industry-ready (resume): ResumeBuilder, ResumeToolbar, ResumePreview, ListEditor, BasicsEditor, LinksEditor, SkillsEditor, ExperienceEditor, ProjectsEditor, EducationEditor, CertificationsEditor, BulletsField, MonthRange, useResumeDraft | Resume Builder editor, preview and save | Built |
| industry-ready (cv): CvScreener, DropZone, CvReportView, ScreeningHistory, useCvScreenings | CV screening upload, report and history | Built |
| pricing: LevelCard | One level's price and windows, from shared constants | Built |

## Server helpers (`server`, `db`)

| Name | Purpose | Status |
| --- | --- | --- |
| withApiGate, withDelegatedGate | Route wrapper: origin check, authenticate, rate-limit, validate, authorise (`server/api`) | Built |
| createApiGate, gateKindOf | Builds the gate from its dependencies (tests inject fakes); marks gated handlers | Built |
| authenticate, requirePageIdentity | Session to `Identity` for routes and for pages | Built |
| getAuth, onSessionCreated | Better Auth instance; after each sign-in: audit, watermark code, end other sessions | Built |
| readLesson, markLesson | One published lesson for one learner: paced, entitlement-checked, watermarked (`server/lessons.ts`) | Built |
| markCode, embedMark, findMarks | Invisible per-learner watermark in text (`server/invisible-mark.ts`) | Built |
| sanitizeSvg | Allow-listed inline SVG for diagrams | Built |
| enforceRateLimit | Throws RATE_LIMITED with Retry-After; used by the gate and by lesson reads | Built |
| findPublishedLesson, findCourseOutlines | Published content reads (`db/content.ts`, ADR 0018) | Built |
| registerMarkCode | Watermark code to learner trace table (`db/watermark-codes.ts`) | Built |
| buildAdminGrant, applyAdminGrant | Admin grant to entitlement plus audit entry (`server/grants.ts`) | Built |
| replaceEntitlement | Replaces one window and audits it in one transaction (`db/entitlements.ts`) | Built |
| findUserIdByEmail | Learner id for an email (`db/users.ts`) | Built |
| findPublishedQuestions | Published questions with company tags, search, filters, pages (`db/questions.ts`) | Built |
| setLessonDone, findDoneLessonIds | Lesson progress (`db/progress.ts`) | Built |
| recordProgress | Progress for a published lesson the learner may read (`server/progress.ts`) | Built |
| optionalPageIdentity | The signed-in learner on a public page, or null | Built |
| readLessonPreview | Latest lesson draft for a signed-in CMS admin (`server/preview.ts`) | Built |
| enforceReadPacing, learnerMarkCode, markBlocks | Shared by every paid read (`server/paid-content.ts`) | Built |
| loadPaidContent, isLocked | Page helper: not found becomes 404, no access becomes a lock reason (`server/paid-page.ts`) | Built |
| paidReadRoute | GET route for one paid item by public id (`server/api/paid-read-route.ts`) | Built |
| readAnswer, findPublishedQuestion, findPublishedAnswerBlocks | Question answers through the answers-only user (`server/answers.ts`, `db/answers.ts`) | Built |
| createTtlCache, clearLessonCache | In-memory cache with expiry; the published-lesson cache | Built |
| signInAnomalies, clientCountry | Pure sign-in anomaly detection (`server/anomalies.ts`) | Built |
| raiseAlert, recordAlert | Records a security alert for review (`server/alerts.ts`, `db/security-alerts.ts`) | Built |
| findLastSignInCountry | Country of the learner's previous sign-in (`db/audit-log.ts`) | Built |
| findServices, isServiceOpen | Industry Ready services and their status (`db/services.ts`) | Built |
| findResume, saveResume, deleteResume | Resume storage (`db/resumes.ts`) | Built |
| saveScreening, listScreenings, deleteScreenings | Screening reports, never files (`db/cv-screenings.ts`) | Built |
| assertCareerTool, careerToolState | Service open plus active content entitlement (`server/career-services.ts`) | Built |
| extractCvText | PDF or .docx text, type checked by file bytes (`server/cv-text.ts`) | Built |
| renderResumePdf, ResumeDocument | Server-side ATS-friendly resume PDF (`server/resume-pdf/`) | Built |
| assertEntitled | The one entitlement check used by every route | Built |
| visibleMark | Builds the visible watermark text per user (`server/watermark.ts`) | Built |
| redisRateLimiter, RATE_LIMITS | Fixed-window limiter (one Redis command a request) and per-route budgets | Built |
| AppError, toResponse | Typed errors and the single error-to-response mapper | Built |
| getConfig | Validated environment configuration | Built |
| log | The one structured logger | Built |
| getDb, getMongoClient | One MongoClient per instance (`db/client.ts`) | Built |
| appendAudit | Appends audit entries; no update or delete exists (`db/audit-log.ts`) | Built |
| findEntitlements | Reads a user's entitlements (`db/entitlements.ts`) | Built |
| recordReplacedSessions, wasReplaced | Hashes of sessions ended by a newer sign-in (`db/ended-sessions.ts`) | Built |

## CMS (`cms`)

| Name | Purpose | Status |
| --- | --- | --- |
| contentAccess, hasRole, isAdmin, isOwnerField | Payload access: admins read, authors draft, editors publish, owners manage admins | Built |
| titleField, orderField, slugField, publicIdField | Shared collection fields | Built |
| LESSON_BLOCKS | Editor forms for the shared lesson block types | Built |
| AccessGrants | Append-only grants collection; hooks apply the grant (`cms/collections/access-grants.ts`) | Built |
| Companies, Questions, Answers | Question bank collections; answers admins-only | Built |
| Drills, DrillPrivate | Drill authoring; private part never readable by the site | Built |
| Services, SecurityAlerts | Industry Ready services; read-only alerts for Support | Built |
| levelOfModule, relationId | Level of a module's course; id from a relationship value | Built |
| content-import script | `pnpm content:import` (`scripts/content-import.ts`), format in `ContentImportSchema` | Built |

## Shared package (`packages/shared`)

| Name | Purpose | Status |
| --- | --- | --- |
| constants | Level labels, prices in paise, content and tool window lengths | Built |
| schemas | Level, role, user id, entitlement, audit entry, lesson blocks, published lesson, course outline | Built |
| ERRORS, ErrorCode | Stable error codes with status and client message | Built |
| ROUTES, API_ROUTES | Every page and API path | Built |
| priceFor, quotePurchase | Pure pricing, including upgrade difference and downgrade refusal | Built |
| grantFor, highestActiveLevel | Pure grant rules | Built |
| decideAccess | Pure access decision for lessons, Drills, answers and career tools | Built |
| isActive, addMonths, windowFrom | Window arithmetic (UTC calendar months) | Built |
| formatInr | Paise to "₹5,000" | Built |
| DRILL_LIMITS, drillLimitProblem, TOP_MODULE_PATTERN | Per-level Drill caps and safe top-module names | Built |
| AlertKindSchema, ServiceStatusSchema | Alert kinds; service status | Built |
| ResumeSchema, emptyResume, formatResumePeriod | Resume data, blank resume, date display | Built |
| screenCv, CvReportSchema, CvScreeningSchema | Pure CV screening rules and report shapes | Built |

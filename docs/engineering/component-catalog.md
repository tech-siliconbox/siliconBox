# Component and helper catalog

Check here before writing a component, hook or helper. Add a row when you create one; remove it when you delete one. Keep it accurate; a stale catalog causes duplicates. Paths are under `apps/web/src/` unless they start with `packages/`.

## UI primitives (`components/ui`)

| Name | Purpose | Status |
| --- | --- | --- |
| Button, `buttonVariants` | Actions; `primary`/`secondary`/`danger` (what cannot be undone), `lg`/`md`/`sm`. Use `buttonVariants` to style a `Link` | Built |
| Badge | Small mono label (`outline`, `muted`, `inverted`) | Built |
| Card | Bordered surface, no shadow | Built |
| Eyebrow, EYEBROW_CLASS | Mono uppercase label above headings; its classes for a heading or table cell | Built |
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
| ProtectedContent | Wraps paid views: no selecting, copying, right-click, dragging or printing of text; blurs while the window is out of focus; code examples stay copyable (ADR 0023) | Built |
| PaidContentLocked | Why a lesson or answer is locked, with the way forward | Built |
| SessionGuard | Re-checks the session every minute and on focus; sends the learner to sign-in with the reason | Built |
| LessonBlockRenderer | Renders lesson blocks on the server from one renderer per block type (`components/lesson`); diagrams go through `sanitizeSvg` | Built |
| formatDuration | Reading time as "45 min" or "2.5 h" (`lib/format-duration.ts`) | Built |
| parseHtml, renderHtml | The one way to read and write author markup, keeping SVG intact (`lib/html-document.ts`) | Built |
| isRefusedAgent, AI_CRAWLERS | AI crawlers and scraping tools refused by the proxy and named in robots.txt (`lib/ai-crawlers.ts`, ADR 0027) | Built |
| deriveSections | A page's parts (h2): anchors, kind, share of the time; run on every lesson save (`cms/lesson-sections.ts`) | Built |
| Prose, TextBody | Inline lesson text (`code`, **bold**, *italic*), and multi-line text with paragraphs and "- " bullets (`components/lesson/prose.tsx`) | Built |
| CopyCodeButton | Copy button on code examples, the one copyable part of paid content | Built |
| LessonBody | A lesson's blocks inside `ProtectedContent`, with the site's heading unless the lesson is an author's page that has its own (`components/lesson/lesson-body.tsx`) | Built |
| CourseHtml | An author's page markup (`html` block, course introduction): sanitised on every render, code examples with Copy, tables in a scroll frame; styled by `.course-html` in `app/(site)/lesson-content.css` (ADR 0024) | Built |
| DrillEmbed | A Drill's brief and editor after its lab in a lesson; left out when unpublished or not open to the learner (`components/lesson/drill-embed.tsx`) | Built |
| LessonList, LessonTable | List blocks (answers behind "Show answer") and table blocks (`components/lesson`) | Built |
| StateGraphFigure | Interactive simulation-vs-formal figure for a `stateGraph` block; panels, SVG and hooks in `components/lesson/state-graph`, pure rules in `state-graph-engine.ts`. The graph and its text come from the lesson | Built |

## Hooks (`hooks`)

| Name | Purpose | Status |
| --- | --- | --- |
| useSessionCheck | Periodic session validity check against `GET /api/v1/me` | Built |

## Feature parts (`features/<name>`)

| Name | Purpose | Status |
| --- | --- | --- |
| auth: AuthForm, useAuthAction, AuthPanel, FormError, formValue | Shared frame, submit and error handling for sign-in and sign-up | Built |
| auth: SignInForm, SignUpForm, GoogleButton | The auth actions (email and password, Google; ADR 0025) | Built |
| auth: PasswordField | The password input with a show/hide button (sign-in, sign-up, reset, Settings); a new password carries the length rule | Built |
| auth: NameField, NameForm, ChangePasswordForm | The name input (sign-up, Settings); change the name; change the password, signing other devices out | Built |
| auth: DeleteAccountForm | Deletes the account from Settings: the password, or for a Google account the email typed out and a sign-in within a day | Built |
| auth: ForgotPasswordForm, ResetPasswordForm | Ask for a reset link (same answer for any email); set a new password from the link | Built |
| auth: VerifyEmailButton | Sends the email verification link again from Settings (ADR 0028) | Built |
| auth: AccountMenu | The header's avatar menu when signed in: name, email, the member pages (`MEMBER_PAGES`), Sign out; closes on Escape or a click outside | Built |
| dashboard: DashboardFrame, DashboardNav | The member area's page frame with its sidebar (Overview, Activity, Settings, Help; Help keeps it when signed in); a row of tabs on phones | Built |
| dashboard: StatTiles, Panel, RecentActivity | A row of numbers; a bordered section with a heading row and optional count; the latest finished lessons and runs (Overview, Activity) | Built |
| dashboard: ActivityGraph | A year of activity, a square a day in the heat colours, scrolling to this week on phones; no client code | Built |
| dashboard: windowText | An access window in words ("Open until 18 Feb 2027") | Built |
| courses: CourseOutlineView, CourseLevelBadge | Public outline: modules with lesson and Drill titles only, done marks for signed-in learners | Built |
| courses: CourseIndexLayout, ModuleIndex | A lesson beside its course's modules (sticky sidebar on wide screens, fold-out list on phones): each module folds out to its parts (theory, lab, practice, project, the practice tool) with times; done marks, current module, locked modules; pure rules in `features/courses/course-progress.ts` | Built |
| courses: CourseProgressBar, modulesDone, nextLesson | "N of M modules done" with a bar (module index, Overview); the next lesson a learner may open | Built |
| PageIntro | The top of a section page: label, heading, a sentence (Courses, Pricing, Questions, Industry Ready) | Built |
| SiteLink | Every link within the site; never prefetches (golden rule, ADR 0027). Lint allows `next/link` only here (`components/ui/site-link.tsx`) | Built |
| admin-tools: TraceForm, TraceResults | Watermark trace tool: paste leaked text, see the accounts it points to | Built |
| drills: DrillWorkspace, CodeEditor, RunOutput, WaveformView | Drill page right side: file tabs (design read-only, properties editable), Run, queue position, per-property results, traces as waveforms | Built |
| drills: useDrillRun, useDrillDraft, waveRows | Start a run and poll it (1 s, 2 s, 5 s, `RUN_POLL_DELAYS_MS`); keep the learner's draft in this browser; trace to waveform rows | Built |
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
| sendEmail, verificationEmail, passwordResetEmail | One email through Resend (send-only key; never to reserved test domains); the account link emails in text and HTML (`server/email.ts`, `server/account-emails.ts`) | Built |
| readCourseIndex, findDoneInCourse | A lesson's course for its module index: outline, done lessons, full access or preview only (`server/course-index.ts`, `server/progress.ts`) | Built |
| readLesson, markLesson | One published lesson for one learner, by its course and lesson slugs: paced, entitlement-checked, watermarked (`server/lessons.ts`) | Built |
| startRun, readRun | Start and follow a run: visible job, then grading against the hidden designs (`server/runs.ts`) | Built |
| gradingPlan, gradingView, startGrading, advanceGrading | ADR 0021 grading (`server/grading.ts`); hidden designs read only through `db/grading.ts` | Built |
| solverJob, jobHash | The learner's code against a design with the Drill's settings; cache key (`server/drill-jobs.ts`) | Built |
| cmsAdminSession, hasAdminRole | The signed-in CMS admin for a request (Payload session) and a role check; used by the lesson preview and the trace tool (`server/cms-admin.ts`) | Built |
| traceLeak, traceLeakAction | Hidden codes and visible marks in leaked text to learner accounts; the admin action is rate-limited and audit-logged (`server/watermark-trace*.ts`) | Built |
| visibleMark, parseVisibleMarks | Writes and reads the visible watermark (`server/watermark.ts`) | Built |
| readDrill | One published Drill for one learner: paced, readable with content access, `canRun` with tool access too, brief watermarked (`server/drills.ts`) | Built |
| markCode, embedMark, findMarks | Invisible per-learner watermark in text (`server/invisible-mark.ts`) | Built |
| sanitizeSvg | Allow-listed inline SVG for diagrams | Built |
| sanitizeCourseHtml, resolveCourseLinks, markCourseHtml | An author's page markup: allow-listed elements and attributes, `lesson:`/`course:` links to routes, the invisible watermark in its text (`server/course-html.ts`, ADR 0024) | Built |
| enforceRateLimit | Throws RATE_LIMITED with Retry-After; used by the gate and by lesson reads | Built |
| createMongoClient | Every database user's client, with the small pool free Atlas needs (`db/client.ts`) | Built |
| findPublishedLesson, findPublishedDrill, findPublishedDrillForRun, findCourseOutlines, findLessonCourses | Published content reads, sharing one published-with-level query; lessons and Drills by slug with their course; each linked lesson's course for links between pages (`db/content.ts`, ADR 0018) | Built |
| registerMarkCode | Watermark code to learner trace table (`db/watermark-codes.ts`) | Built |
| buildAdminGrant, applyAdminGrant | Admin grant to entitlement plus audit entry (`server/grants.ts`) | Built |
| replaceEntitlement | Replaces one window and audits it in one transaction (`db/entitlements.ts`) | Built |
| findUserIdByEmail | Learner id for an email (`db/users.ts`) | Built |
| findPublishedQuestions | Published questions with company tags, search, filters, pages (`db/questions.ts`) | Built |
| setLessonDone, findDoneLessonIds, findCompletions | Lesson progress; finished lessons with their dates (`db/progress.ts`) | Built |
| findRunOutcomes, runSolved | A learner's runs, newest first, and whether one solved its Drill (`db/runs.ts`, `server/runs.ts`) | Built |
| readActivity, dayCounts, activeDays, doneLessonIds, solvedDrillIds | A learner's finished lessons and runs as one newest-first list, and what it adds up to: per day, days, lessons, Drills (`server/activity.ts`) | Built |
| readOverview | The Overview's data: every course with the learner's access, and their activity (`server/overview.ts`) | Built |
| hasPassword | Whether the signed-in account has a password (Google-only accounts do not) (`server/auth/auth.ts`) | Built |
| findPublishedFaqs | The Help page's published questions, in order (`db/faqs.ts`) | Built |
| buildDataExport | Everything held about a learner in plain fields, for the download in Settings; never tokens, Drill code or watermark codes (`server/data-export.ts`) | Built |
| deleteLearnerData | Empties a learner's own collections when they delete the account; the audit log and security alerts stay (`db/learner-data.ts`) | Built |
| findSignIns, findAllScreenings | A learner's sign-ins (when, country); all their CV reports (`db/audit-log.ts`, `db/cv-screenings.ts`) | Built |
| recordProgress | Progress for a published lesson the learner may read (`server/progress.ts`) | Built |
| optionalPageIdentity | The signed-in learner on a public page, or null | Built |
| readLessonPreview | Latest lesson draft for a signed-in CMS admin (`server/preview.ts`) | Built |
| enforceReadPacing, learnerMarkCode, markBlocks | Shared by every paid read (`server/paid-content.ts`) | Built |
| loadPaidContent, isLocked | Page helper: not found becomes 404, no access becomes a lock reason (`server/paid-page.ts`) | Built |
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
| assertEntitled, isEntitled | The one entitlement check used by every route; the same as a yes or no for what a page may offer | Built |
| errorMessage | Message from an API error body, for client hooks (`lib/api-error.ts`) | Built |
| formatDate, formatMonth, formatTimeAgo | "18 Feb 2027", "Feb" and "3 hours ago", in India time (`lib/format-date.ts`) | Built |
| countOf | A number with its noun, plural unless one: "1 day", "3 Drills" (`lib/count-of.ts`) | Built |
| MEMBER_PAGES | The learner's own pages in order, for the avatar menu and the sidebar (`lib/member-pages.ts`) | Built |
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
| Faqs | The Help page's questions and answers, drafted and published like lessons | Built |
| levelOfModule, relationId | Level of a module's course; id from a relationship value | Built |
| content-import script | `pnpm content:import <file> [check] [prune]` (`scripts/content-import.ts`): courses, modules, lessons and Drills with their private part; reports or prunes what a file no longer lists; writes with `SCRIPT_CONTEXT` so CMS hooks skip server-only work | Built |
| content-convert script | `pnpm content:convert` (`scripts/content-convert.ts`, `scripts/course-html/`): course HTML to an import file, one page per module with its markup word for word, diagram colours written onto the SVG, Drills after their labs; notes on anything changed (ADR 0024) | Built |

## Shared package (`packages/shared`)

| Name | Purpose | Status |
| --- | --- | --- |
| constants | Level labels, prices in paise, content and tool window lengths, password and name lengths | Built |
| schemas | Level, role, user id, entitlement, audit entry, lesson blocks (with `stateGraphProblems`), published lesson, course outline | Built |
| slugify | Readable slugs for addresses and anchors (`packages/shared/src/slug.ts`) | Built |
| inline-text | The lesson text format: `parseInlineText` for rendering, `escapeInlineText` and `inlineCode` for writing it | Built |
| ERRORS, ErrorCode | Stable error codes with status and client message | Built |
| ROUTES, API_ROUTES | Every page and API path | Built |
| outlineLinks | Lesson and Drill ids to their titles and page links, from course outlines (`outline-links.ts`) | Built |
| priceFor, quotePurchase | Pure pricing, including upgrade difference and downgrade refusal | Built |
| grantFor, highestActiveLevel | Pure grant rules | Built |
| decideAccess | Pure access decision for lessons, Drills, answers and career tools | Built |
| isActive, addMonths, windowFrom | Window arithmetic (UTC calendar months) | Built |
| contentStatus, toolStatus | A level's (or the tool's) window for display: open until, ended, or never bought (`entitlements/status.ts`) | Built |
| activityDay, dayDate, currentStreak, longestStreak, activityWeeks, SITE_TIME_ZONE | Activity days in India time, day streaks (a streak lasts until the day without activity ends) and the year graph's weeks (`activity.ts`) | Built |
| FaqSchema | One Help question and its answer (`schemas/faq.ts`) | Built |
| formatInr | Paise to "₹5,000" | Built |
| DRILL_LIMITS, drillLimitProblem, TOP_MODULE_PATTERN | Per-level Drill caps and safe top-module names | Built |
| RunInputSchema, RunResultSchema, RunViewSchema, isDrillSolved, DRILL_RUN_DAILY_QUOTA, dailyRunQuota | Drill run input, solver result, learner view, solved rule and daily quota by level (`schemas/run.ts`, `entitlements/run-quota.ts`) | Built |
| solver-client (`submitJob`, `readJob`) | The only code that calls the solver; signs a one-minute token per learner and scope (`server/solver-client.ts`) | Built |
| startRun, readRun | Run service: Drill access, cache, quota, solver, status refresh (`server/runs.ts`) | Built |
| AlertKindSchema, ServiceStatusSchema | Alert kinds; service status | Built |
| ResumeSchema, emptyResume, formatResumePeriod | Resume data, blank resume, date display | Built |
| screenCv, CvReportSchema, CvScreeningSchema | Pure CV screening rules and report shapes | Built |

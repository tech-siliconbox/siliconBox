# Component and helper catalog

Check here before writing a component, hook or helper. Add a row when you create one; remove it when you delete one. Keep it accurate; a stale catalog causes duplicates. Paths are under `apps/web/src/` unless they start with `packages/`.

## UI primitives (`components/ui`)

| Name | Purpose | Status |
| --- | --- | --- |
| Button, `buttonVariants` | Actions; `primary`/`secondary`/`danger` (what cannot be undone), `lg`/`md`/`sm`. Use `buttonVariants` to style a `Link` | Built |
| Badge | Small mono label (`outline`, `muted`, `inverted`) | Built |
| Card | Bordered surface, no shadow | Built |
| Eyebrow, EYEBROW_CLASS | Mono uppercase label above headings; its classes for a heading or table cell | Built |
| Field, TextField, TextAreaField, SelectField | Label plus control; input, textarea and select share one wrapper (`SelectField` hands back the option's own value) | Built |
| CspImage | `next/image` without the inline style the CSP blocks; use it instead of `next/image` | Built |
| Tabs | Tab list and panels | Planned |
| Dialog | Modal | Planned |
| Table | Data table | Planned |
| Skeleton | Loading placeholder | Planned |

## Shared components (`components/shared`)

| Name | Purpose | Status |
| --- | --- | --- |
| PageShell, PAGE_SPACING | Header (with an `headerActions` slot), main, footer. `PAGE_SPACING` is the one top and bottom space for every page's content, kept small so a short page fits a laptop window without scrolling | Built |
| SiteHeader, SiteFooter | Nav and footer used by PageShell; the footer is one compact row (brand, links, copyright) on wider screens | Built |
| BrandMark | Logo icon with "SiliconBox" as live text | Built |
| GuestActions | Sign in / Get started header actions | Built |
| NAV_LINKS | Main sections, shared by header and footer (`components/shared/nav-links.ts`) | Built |
| Watermarked | Tiles the visible mark over content (SVG, no inline styles). The invisible text pattern comes with lesson rendering in phase 2 | Built |
| LockedCard | Locked state for services and levels, with the reason; fills its grid cell, its action at the bottom | Built |
| CodeEditor | Monospace text area with line numbers; Tab indents, Esc then Tab leaves; read-only without `onChange`; `goto` scrolls to a line, selects it and marks its number. Used by the Drill workspace and Praman | Built |
| PramanMark | Praman's own mark (the blue P and its name): the header's tool link and the tool's menu bar | Built |
| WaveformView, waveRows, BitWave, BusWave | A counterexample or cover trace as waveform rows (bits as lines, buses as labelled segments); `waveRows` (`lib/waveform.ts`) turns a trace into rows. `BitWave` and `BusWave` (`components/shared/wave-shapes.tsx`) draw every waveform's rows, Drills' and Praman's Visualize alike. Used by the Drill workspace | Built |
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
| useDismiss | Closes an open menu on a click outside it or on Escape; the account menu and Praman's menu bar and row menus | Built |

## Feature parts (`features/<name>`)

| Name | Purpose | Status |
| --- | --- | --- |
| ActionForm, useFormAction, FormError | A form whose submit calls an action (auth or our API): pending state, its error, then where to go; used by account, assessment and capstone forms (`components/shared/action-form.tsx`, `hooks/use-form-action.ts`, `components/ui/form-error.tsx`) | Built |
| FileInput | A file picker in the site's button style (photo, capstone upload) (`components/ui/file-input.tsx`) | Built |
| auth: AuthPanel, formValue | The sign-in and sign-up frame (no logo of its own: the site header shows it, so sign-up fits a 1280x720 window); a form field's text | Built |
| auth: SignInForm, SignUpForm, GoogleButton | The auth actions (email and password, Google; ADR 0025) | Built |
| auth: PasswordField | The password input with a show/hide button (sign-in, sign-up, reset, Settings); a new password carries the length rule | Built |
| auth: NameField, NameForm, ChangePasswordForm | The name input (sign-up, Settings); change the name; change the password, signing other devices out | Built |
| auth: ProfileForm, PhotoForm | Handle, bio and links, checked in the browser with the server's `ProfileSchema`; upload or remove the photo | Built |
| auth: DeleteAccountForm | Deletes the account from Settings: the password, or for a Google account the email typed out and a sign-in within a day | Built |
| auth: ForgotPasswordForm, ResetPasswordForm | Ask for a reset link (same answer for any email); set a new password from the link | Built |
| auth: VerifyEmailButton | Sends the email verification link again from Settings (ADR 0028) | Built |
| auth: AccountMenu | The header's avatar menu when signed in: name, email, the member pages (`MEMBER_PAGES`), Sign out; closes on Escape or a click outside | Built |
| dashboard: DashboardFrame, DashboardNav | The member area's page frame with its sidebar (Overview, Activity, Settings, Help; Help keeps it when signed in); a row of tabs on phones | Built |
| dashboard: StatTiles, Panel, RecentActivity | A row of numbers; a bordered section with a heading row and optional count; the latest finished lessons and runs (Overview, Activity) | Built |
| dashboard: ProfileCard | The Overview's profile at a glance: photo, name, handle, bio, links, Edit profile | Built |
| dashboard: ActivityGraph | A year of activity, a square a day in the heat colours, scrolling to this week on phones; no client code | Built |
| dashboard: windowText | An access window in words ("Open until 18 Feb 2027") | Built |
| courses: CourseOutlineView, CourseLevelBadge | Public outline: modules with lesson and Drill titles only, done marks for signed-in learners | Built |
| courses: CourseIndexLayout, ModuleIndex | A lesson beside its course's modules (sticky sidebar on wide screens, fold-out list on phones): each module folds out to its parts (theory, lab, practice, project, the practice tool) with times; done marks, current module, locked modules; pure rules in `features/courses/course-progress.ts` | Built |
| courses: CourseProgressBar, modulesDone, nextLesson | "N of M modules done" with a bar (module index, Overview); the next lesson a learner may open | Built |
| Avatar | The learner's photo, or their initials on a dark circle; `sm` (menu) and `lg` (Settings, Overview) (`components/shared/avatar.tsx`) | Built |
| PageIntro | The top of a section page: label, heading, a sentence (Courses, Pricing, Questions, Industry Ready) | Built |
| SiteLink | Every link within the site; never prefetches (golden rule, ADR 0027), so it shows a thin bar at the top while the clicked page loads (`useLinkStatus`). Lint allows `next/link` only here (`components/ui/site-link.tsx`) | Built |
| admin-tools: TraceForm, TraceResults | Watermark trace tool: paste leaked text, see the accounts it points to | Built |
| admin-tools: AdminToolHeader, CapstoneGradeForm | An admin tool's heading; scores per rubric criterion and feedback for a capstone, saved by `gradeCapstoneAction` | Built |
| AssessmentEmbed, CapstoneEmbed | Graded course work in a module's page (ADR 0029): questions as radio groups, then the review with the key once finished; the rubric, upload, scores and feedback (`components/lesson/`) | Built |
| assessments: AssessmentForm, CapstoneUpload | Sends an attempt (an answer per question) or the project .zip, then shows the page again at its block | Built |
| InlineCourseHtml | A short piece of the author's markup inside a line (a question, an option, a rubric line), sanitised (`components/lesson/course-html.tsx`) | Built |
| drills: DrillWorkspace, RunOutput | Drill page right side: file tabs (design read-only, properties editable), Run, queue position, per-property results, traces as waveforms | Built |
| drills: useDrillRun, useDrillDraft | Start a run and poll it (1 s, 2 s, 5 s, `RUN_POLL_DELAYS_MS`); keep the learner's draft in this browser | Built |
| praman: PramanWorkbench, SessionView, PramanScreen, MenuBar, MenuList, RowMenu, ToolBar, PanelTabs, LeftPanel, CenterPanel, ScreenDocks, DropFiles, Splitter, HowItWorks, StatusIcon, PropertyFilterBar, PropertyFooter, StatusBar, SessionStatus, LogPanel, TclConsole, ToolDialog, CommandDialog, SessionsDialog, AboutDialog, CheckDialogs (Equivalence, Connectivity, Task, Abstract), CaseSplitDialog, ClockResetDialog, StrengthPanel, CoveragePanel, EquivalencePanel, report parts (Score, ReportHead, ReportTable, Mark), VisualizeWindow (head, tools, find, signal lists, wave table, why panel: Why it fails, Drivers, Why diagram), DriversList, FilesPanel, HierarchyPanel, PropertyTable, SourceEditor, RunHistory, RunDetail (Results, Changes, Log, Files), PramanLocked | The tool page (`/tool`, ADR 0031), laid out like Praman in the site's theme: menu bar (File, View, Design, Prove, Reports, Tools, Help), icon toolbar, Design Hierarchy and Files tabs, the Properties Table with files and the run history in closable tabs, the log with its filter chips and search, the `praman>` console with history and Tab completion, and the status bar; dialogs for commands, sessions and About; the locked card without access | Built |
| praman: usePramanSession, useJson, useView, useWhatIf, useDrivers, useNow, useLayout (panels and sizes, kept in the browser), useSignalLists, readTextFiles, moveRow, stepRow, savedRows, withList, cyclesOf, formatValue, defaultRows, expressionValues, findCycle, traceToVcd, trace expressions (parse, evaluate), propertyRows, resultCounts, instanceRollup, proofProgress, commandSpecs, check commands, readPramanTrace, tclCommand, tclList, abilitiesOf, pramanMenus, propertyMenu, visibleLines, completion, propertyCounts, askWhatIf, askDrivers | Open a session (waiting in line), poll it and send commands; GET JSON for a panel; the menu's command forms with the learner's ceilings; the deeper checks' Tcl lines (equivalence, connectivity, task, abstract, case split); Praman's trace payload as a `Trace`; Tcl words and lists; what can run now (menus and toolbar share it); the menus and a property row's menu as data; the log's filter and search; Tab completion; the status bar's counts; a what-if (following its 202) and a signal's drivers | Built |
| questions: QuestionCard, QuestionSearch, questionsHref | Public question bank list, GET search form, filter links | Built |
| progress: MarkDoneButton | Marks a lesson done or not done | Built |
| industry-ready: ServiceCard | Open or locked service card, equal heights in a row; links only to built services. The page groups them as Open now and Coming soon, in columns that leave no card alone | Built |
| industry-ready: CareerToolLocked | Why a career tool is unavailable, with the next step | Built |
| industry-ready (resume): ResumeBuilder, ResumeLibraryBar, ResumeToolbar, ExportMenu, ResumePreview | The builder: which resume is open (switch, rename, new, duplicate, delete), save state, undo and redo, the panels and downloads (PDF, Word, JSON Resume, Markdown); the preview in the chosen design (`preview-classes.ts`, CSP-safe classes tested against the PDF colours) | Built |
| industry-ready (resume): ListEditor, EntryControls, BasicsEditor, LinksEditor, SkillsEditor, ExperienceEditor, ProjectsEditor, EducationEditor, CertificationsEditor, AwardsEditor, PublicationsEditor, LanguagesEditor, CustomSectionEditor, BulletsField, MonthRange | Section editors; ListEditor adds, removes and reorders entries with EntryControls (also used by the Sections panel) | Built |
| industry-ready (resume): SectionsPanel, DesignPanel, ImportPanel, TailorPanel | Section order, visibility and headings, custom sections; template and design settings; imports (JSON Resume, LinkedIn, AI); tailoring to a job with AI | Built |
| industry-ready: PanelFrame, AiConsent, AiComingSoon | A bordered panel with a heading; an AI feature's notice, unticked agreement and allowance; "Coming soon" while AI is off (CV feedback, tailoring, AI import) | Built |
| industry-ready: useResumeWorkspace, useResumeDraft, useUndoHistory, useResumeImport, useResumeTailor | The learner's resumes and the open one; autosave, Ctrl/Cmd+S and undo; imports; tailoring proposals | Built |
| industry-ready: ResumeDraft, Account, blankDraft, toDraft | The resume open in the builder, made by the server page and edited by the client hooks; kept out of client-only modules so the page can call them (`features/industry-ready/resume-draft.ts`) | Built |
| industry-ready (cv): CvScreener, DropZone, CvReportView, ScreeningHistory, useCvScreenings | CV screening upload (with an optional job description), report (with the job match), AI feedback, and history with the kept files to download | Built |
| industry-ready (cv): AiFeedbackPanel, AiFeedbackView, useCvFeedback | AI feedback on a saved report: the notice, an unticked agreement, the request; the feedback as plain text (ADR 0030) | Built |
| industry-ready: JobDescriptionField, AtsText | The optional job description box; "What an ATS reads", the text read from a file (both used by CV screening and the resume check) | Built |
| industry-ready: ResumeCheckPanel, useResumeCheck | Resume Builder's check: its saved PDF screened like an upload, with the job match; opened from the toolbar | Built |
| industry-ready: useApiRequest | Pending and error state around one call to our API; returns the response only when it succeeded | Built |
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
| sanitizeCourseHtml, resolveCourseLinks, markCourseHtml, markHtmlFragment | An author's page markup (or a short piece of it): allow-listed elements and attributes, `lesson:`/`course:` links to routes, the invisible watermark in its text (`server/course-html.ts`, ADR 0024) | Built |
| enforceRateLimit | Throws RATE_LIMITED with Retry-After; used by the gate and by lesson reads | Built |
| createMongoClient | Every database user's long-lived client, with the small pool free Atlas needs (`db/client.ts`) | Built |
| describeDatabase, connectionProblem, pingDatabase, PROBLEM_HINTS | Where a connection points (never the password), why it failed in plain words, a one-off ping; used by the dev startup report and `pnpm db:allow-my-ip` (`db/connection-status.ts`) | Built |
| reportDatabaseConnections | Dev server startup: one log line per database user, connected or why not (`server/database-report.ts`, called from `instrumentation.ts`) | Built |
| findPublishedAssessment, findPublishedCapstone, findCourseWorkList | Published course work with its course and the page that shows it (`db/content.ts`, ADR 0029) | Built |
| findAssessmentKey | An assessment's answer key, through the grader connection only (`db/grading.ts`) | Built |
| findAttempts, findAllAttempts, recordAttempt | Assessment attempts; at most three, enforced in one write (`db/assessment-attempts.ts`) | Built |
| findSubmissions, saveSubmission, listSubmissionsForReview, findSubmissionForReview, findSubmissionFile, saveGrade | Capstone submissions (one waiting per learner), their .zip files and grades (`db/capstone-submissions.ts`) | Built |
| readAssessmentView, submitAttempt | The assessment for a page (key only once finished); an attempt scored on the server (`server/assessments.ts`) | Built |
| readCapstoneView, submitCapstone | The capstone for a page; a .zip upload checked by its bytes (`server/capstones.ts`) | Built |
| expertSession, gradeCapstoneAction | Editors and the Owner grading capstones; the grade saved and audit-logged (`server/capstone-reviews.ts`, `server/capstone-grade-action.ts`) | Built |
| readPerformance, courseWorkAccess | Each course's assessment and capstone with where the learner stands; the access both need (`server/performance.ts`, `server/course-work.ts`) | Built |
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
| readProfile, readPhotoUrl | A learner's profile with their photo's versioned address; the address alone for the header, once per request (`server/profile.ts`) | Built |
| findProfile, saveProfile, findPhoto, findPhotoVersion, savePhoto, deletePhoto | Profiles (a taken handle is reported, not thrown) and photos as WebP bytes (`db/profiles.ts`) | Built |
| toProfilePhoto | An upload checked by its bytes (JPEG, PNG, WebP), decoded with a pixel cap, turned upright and re-encoded as a 256 px WebP without EXIF (`server/profile-photo.ts`) | Built |
| readUpload, startsWith | A multipart upload's file, size-checked before and after reading, and its text fields for the route's schema (`parseWith`); a file signature check (`server/upload.ts`, `server/file-bytes.ts`) | Built |
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
| listResumes, findResume, findLatestResume, findAllResumes, hasRoomForResume, createResume, saveResume, deleteResume | A learner's resumes, up to `RESUMES_MAX` (`db/resumes.ts`) | Built |
| ownResume, addResume, assertRoomForResume, resumeDownloadRoute | The learner's resume or not found; adding within the limit; the gated PDF and Word download route (`server/resumes.ts`, `server/resume-download.ts`) | Built |
| renderResumeDocx | The resume as a Word file from the same document model (`server/resume-docx/`) | Built |
| readLinkedInExport | The known CSV files of a LinkedIn export, declared sizes capped (`server/linkedin-export.ts`) | Built |
| runAiTask, tailorResume, importCvWithAi, TAILOR_SYSTEM, IMPORT_SYSTEM, dataBlock | One AI task on the allowance with refund and audit; tailoring and AI import; prompts and the one way learner text enters a prompt (`server/ai/task.ts`, `server/resume-ai.ts`, `server/ai/resume-prompts.ts`, `server/ai/prompt-parts.ts`) | Built |
| saveScreening, listScreenings, deleteScreenings, findScreeningFile, saveFeedback | Screening reports with the learner's newest 5 CV files (lists never read the bytes) and their AI feedback (`db/cv-screenings.ts`) | Built |
| askClaude, isAiConfigured, assertAiConfigured, AI_MODEL | The one way to Claude: server only, one structured answer, no tools, failures as `AI_UNAVAILABLE`, no text logged (`server/ai/claude.ts`, ADR 0030) | Built |
| spendAiAllowance, refundAiAllowance | Each learner's AI allowance across tools, taken before a call and given back when it fails (`server/ai/allowance.ts`) | Built |
| giveCvFeedback, reviewCvText, CV_FEEDBACK_SYSTEM, cvFeedbackContent | AI feedback on a saved screening: allowance, redacted text as marked data, checked answer kept and audit-logged (`server/cv-feedback.ts`, `server/ai/cv-feedback-prompt.ts`) | Built |
| fileDownload | A PDF or .docx sent as a download with a safe name (resume PDF, kept CVs) (`server/download.ts`) | Built |
| assertCareerTool, careerToolState | Service open plus active content entitlement (`server/career-services.ts`) | Built |
| extractCvText | PDF or .docx text, page count and type, the type checked by file bytes (`server/cv-text.ts`) | Built |
| renderResumePdf, ResumeDocument | Server-side ATS-friendly resume PDF in the chosen template and design, **bold** and *italic* kept (`server/resume-pdf/`) | Built |
| assertEntitled, isEntitled | The one entitlement check used by every route; the same as a yes or no for what a page may offer | Built |
| errorMessage, sendToApi | Message from an API error body, for client hooks; a form's call to our API as its result (`lib/api-error.ts`) | Built |
| formatDate, formatMonth, formatTimeAgo | "18 Feb 2027", "Feb" and "3 hours ago", in India time (`lib/format-date.ts`) | Built |
| countOf | A number with its noun, plural unless one: "1 day", "3 Drills" (`lib/count-of.ts`) | Built |
| MEMBER_PAGES | The learner's own pages in order, for the avatar menu and the sidebar (`lib/member-pages.ts`) | Built |
| visibleMark | Builds the visible watermark text per user (`server/watermark.ts`) | Built |
| redisRateLimiter, RATE_LIMITS, releaseRateLimit | Fixed-window limiter (one Redis command a request), per-route budgets, and giving one use back | Built |
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
| titleField, orderField, slugField, publicIdField, moduleField, markupField, passMarkField | Shared collection fields | Built |
| LESSON_BLOCKS | Editor forms for the shared lesson block types | Built |
| AccessGrants | Append-only grants collection; hooks apply the grant (`cms/collections/access-grants.ts`) | Built |
| Companies, Questions, Answers | Question bank collections; answers admins-only | Built |
| Drills, DrillPrivate | Drill authoring; private part never readable by the site | Built |
| Services, SecurityAlerts | Industry Ready services; read-only alerts for Support | Built |
| Faqs | The Help page's questions and answers, drafted and published like lessons | Built |
| Assessments, AssessmentKeys, Capstones | Graded course work (ADR 0029): questions; the answer key, which the site cannot read; the capstone rubric | Built |
| levelOfModule, relationId | Level of a module's course; id from a relationship value | Built |
| content-import script | `pnpm content:import <file> [check] [prune]` (`scripts/content-import.ts`): courses, modules, lessons and Drills with their private part; reports or prunes what a file no longer lists; writes with `SCRIPT_CONTEXT` so CMS hooks skip server-only work | Built |
| content-convert script | `pnpm content:convert` (`scripts/content-convert.ts`, `scripts/course-html/`): course HTML to an import file, one page per module with its markup word for word, diagram colours written onto the SVG, Drills after their labs, an assessment section and rubric table turned into graded course work (`course-work.ts`, ADR 0029); notes on anything changed (ADR 0024) | Built |

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
| PublishedAssessmentSchema, KeyAnswerSchema, AttemptInputSchema, scoreAttempt, assessmentStanding, ASSESSMENT_ATTEMPTS | Assessments: questions, the key, an attempt, its score, where a learner stands (`schemas/assessment.ts`) | Built |
| PublishedCapstoneSchema, CapstoneGradeSchema, gradeProblems, rubricTotal | Capstones: rubric, an expert's grade and its checks (`schemas/capstone.ts`) | Built |
| FaqSchema | One Help question and its answer (`schemas/faq.ts`) | Built |
| ProfileSchema, PROFILE_LINKS, emptyProfile, PhotoQuerySchema | Handle (3 to 30 of a-z, 0-9, _; a few reserved), bio up to 500, https links (LinkedIn and GitHub on their own sites); the links' labels; the photo address's version (`schemas/profile.ts`) | Built |
| formatInr | Paise to "₹5,000" | Built |
| DRILL_LIMITS, drillLimitProblem, TOP_MODULE_PATTERN | Per-level Drill caps and safe top-module names | Built |
| RunInputSchema, RunResultSchema, RunViewSchema, isDrillSolved, DRILL_RUN_DAILY_QUOTA, dailyRunQuota | Drill run input, solver result, learner view, solved rule and daily quota by level (`schemas/run.ts`, `entitlements/run-quota.ts`) | Built |
| solver-client (`submitJob`, `readJob`) | The only code that calls the solver; signs a one-minute token per learner and scope (`server/solver-client.ts`) | Built |
| startRun, readRun | Run service: Drill access, cache, quota, solver, status refresh (`server/runs.ts`) | Built |
| AlertKindSchema, ServiceStatusSchema | Alert kinds; service status | Built |
| ResumeSchema, ResumeDocumentInputSchema, SavedResumeSchema, ResumeImportResultSchema, emptyResume, formatResumePeriod, RESUME_LIST_LIMITS, RESUMES_MAX | Resume data (with design, sections and custom sections), saving and listing resumes, limits | Built |
| resumeDocument, sectionOrder, sectionTitle | The resume as printed: header and sections in order; rendered by the preview, PDF, Word and Markdown (`resume/document.ts`) | Built |
| moveItem, moveSection, toggleSection, renameSection, addCustomSection, removeCustomSection | Edits to a resume's sections (`resume/sections.ts`) | Built |
| RESUME_TEMPLATE_STYLES, RESUME_SPACING_SCALE, RESUME_MARGIN_POINTS, RESUME_ACCENTS | How each template and design setting looks (`resume/design.ts`, `schemas/resume.ts`) | Built |
| toJsonResume, fromJsonResume, resumeMarkdown, resumeFromLinkedIn, parseCsv, csvRecords, fitResume | Exports and non-AI imports (`resume/`) | Built |
| TailorRequestSchema, fitTailoring, applyProposal, tailorPassages, ImportAnswerSchema, fitImport, contactFromCv | AI tailoring and AI import: answers, checks and applying a proposal (`resume/tailor.ts`, `resume/ai-import.ts`) | Built |
| hasPersonalData, addsNumbers, inPosting, clip, AI_NOTICES, AiConsentSchema, AI_ALLOWANCE | Checks every AI answer passes; each feature's notice and the consent its request carries (`ai/`) | Built |
| screenCv, CvReportSchema, CvScreeningSchema | Pure CV screening rules and report shapes | Built |
| matchJobDescription, JobMatchSchema, HARDWARE_KEYWORDS | A CV against a pasted job description on known terms, requirements weighted, offer part skipped (`cv-screening/job-match.ts`) | Built |
| ScreeningOptionsSchema, screeningOptions, NewScreeningSchema, ResumeCheckSchema | The optional job description (blank box: none); the answers of a new screening and of the resume check (`cv-screening/report.ts`) | Built |
| BULLET, nonEmptyLines | Reading CV and job description text line by line (`cv-screening/lines.ts`) | Built |
| EMAIL, WEB_LINK, PERSONAL_DETAILS, phoneNumbers | Contact and personal details in a CV: checked by the screener, removed before AI (`cv-screening/personal-data.ts`) | Built |
| redactCv, cvPassages, REDACTED | A CV's text without the learner's name, contact details, links and personal details; its lines worth rewriting, numbered (`cv-screening/redact.ts`) | Built |
| CvFeedbackAnswerSchema, CvFeedbackSchema, StoredCvFeedbackSchema, fitCvFeedback, CV_FEEDBACK_LIMITS | The model's answer, the checks it must pass and the feedback kept (`cv-screening/feedback.ts`, ADR 0030) | Built |
| CV_FILES_KEPT, CvFileInfoSchema, CvFeedbackRequestSchema | Files kept per learner; a kept file's type and size; asking for AI feedback with the agreed notice (`cv-screening/report.ts`) | Built |
| AI_NOTICE_VERSION | The version of the AI notices each consent names (`ai/notice.ts`) | Built |
| IdParamsSchema, DAY_MS | The `:id` of an API path (a UUID); a day in milliseconds | Built |

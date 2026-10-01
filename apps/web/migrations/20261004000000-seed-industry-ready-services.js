// The Industry Ready services from docs/product/industry-ready.md. All start locked: an admin
// opens each one in the CMS once it works, so no card ever leads nowhere. Existing services
// (matched by slug) are left alone.

const SERVICES = [
  [
    'resume-builder',
    'Resume Builder',
    'Build a verification-focused resume from your SiliconBox work.',
  ],
  [
    'cv-screening',
    'CV screening',
    'Get your CV reviewed against what formal verification roles ask for.',
  ],
  [
    'interview-prep',
    'Interview prep',
    'Structured preparation for formal verification interviews.',
  ],
  [
    'coaching',
    'Coaching and mentorship',
    'One-to-one guidance from practising verification engineers.',
  ],
  ['mock-interview', 'Mock interview', 'A realistic interview with feedback.'],
];

export async function up(db) {
  const now = new Date();
  for (const [index, [slug, title, summary]] of SERVICES.entries()) {
    await db.collection('services').updateOne(
      { slug },
      {
        $setOnInsert: {
          slug,
          title,
          summary,
          status: 'locked',
          lockedReason: 'Opening soon',
          order: index + 1,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }
}

// Removes only the seeded services that nobody has changed since (still locked, same title).
export async function down(db) {
  for (const [slug, title] of SERVICES) {
    await db.collection('services').deleteOne({ slug, title, status: 'locked' });
  }
}

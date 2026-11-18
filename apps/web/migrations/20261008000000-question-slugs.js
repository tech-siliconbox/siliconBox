// Questions get readable slugs for their page address (ADR 0026), made from their text and
// unique, before the CMS adds its unique index on `slug`. Drafts in the version history get
// the slug of their question. A migration is a frozen snapshot, so the rule is written here.

const SLUG_MAX = 60;

function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}

export async function up(db) {
  const questions = db.collection('questions');
  const taken = new Set(
    (
      await questions.find({ slug: { $type: 'string' } }, { projection: { slug: 1 } }).toArray()
    ).map((doc) => doc.slug),
  );
  for (const doc of await questions.find({ slug: { $exists: false } }).toArray()) {
    const base = slugify(doc.text) || 'question';
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    await questions.updateOne({ _id: doc._id }, { $set: { slug } });
    await db
      .collection('_questions_versions')
      .updateMany(
        { parent: doc._id, 'version.slug': { $exists: false } },
        { $set: { 'version.slug': slug } },
      );
  }
}

export async function down(db) {
  await db.collection('questions').updateMany({}, { $unset: { slug: '' } });
  await db.collection('_questions_versions').updateMany({}, { $unset: { 'version.slug': '' } });
}

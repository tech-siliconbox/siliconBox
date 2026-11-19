import 'server-only';
import { type Faq, FaqSchema } from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** The published questions and answers, in order. */
export async function findPublishedFaqs(): Promise<Faq[]> {
  const documents = await getDb()
    .collection(COLLECTIONS.faqs)
    .find({ _status: 'published' }, { projection: { _id: 0, question: 1, answer: 1 } })
    .sort({ order: 1 })
    .toArray();
  return documents.map((document) => FaqSchema.parse(document));
}

import 'server-only';
import {
  type QuestionPage,
  QuestionPageSchema,
  type QuestionQuery,
  QUESTIONS_PER_PAGE,
} from '@siliconbox/shared';
import type { Document } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** The company document for one tag, joined in from `companyDocs`. */
function tagCompany(field: 'name' | 'slug'): Document {
  const match = {
    $filter: { input: '$companyDocs', cond: { $eq: ['$$this._id', '$$tag.company'] } },
  };
  return { $getField: { field, input: { $first: match } } };
}

const PUBLIC_FIELDS: Document = {
  _id: 0,
  publicId: 1,
  text: 1,
  topics: 1,
  companies: {
    $map: {
      input: { $ifNull: ['$companyTags', []] },
      as: 'tag',
      in: { name: tagCompany('name'), slug: tagCompany('slug'), year: '$$tag.year' },
    },
  },
};

function filterStages({ q, topic, company }: QuestionQuery): Document[] {
  const match: Document = { _status: 'published' };
  if (q !== undefined) match.$text = { $search: q };
  if (topic !== undefined) match.topics = topic;
  // Relevance is copied into a field before sorting: MongoDB refuses a $meta sort in a pipeline
  // that later joins and facets.
  const byRelevance = [
    { $addFields: { score: { $meta: 'textScore' } } },
    { $sort: { score: -1, createdAt: -1 } },
  ];
  return [
    { $match: match },
    ...(q === undefined ? [{ $sort: { createdAt: -1 } }] : byRelevance),
    {
      $lookup: {
        from: COLLECTIONS.companies,
        localField: 'companyTags.company',
        foreignField: '_id',
        as: 'companyDocs',
      },
    },
    ...(company === undefined ? [] : [{ $match: { 'companyDocs.slug': company } }]),
  ];
}

const FacetSchema = z.object({
  total: z.array(z.object({ count: z.number() })),
  questions: z.array(z.unknown()),
});

/** Published questions with their company tags, searched and filtered, one page at a time. */
export async function findPublishedQuestions(query: QuestionQuery): Promise<QuestionPage> {
  const [result] = await getDb()
    .collection(COLLECTIONS.questions)
    .aggregate([
      ...filterStages(query),
      {
        $facet: {
          total: [{ $count: 'count' }],
          questions: [
            { $skip: (query.page - 1) * QUESTIONS_PER_PAGE },
            { $limit: QUESTIONS_PER_PAGE },
            { $project: PUBLIC_FIELDS },
          ],
        },
      },
    ])
    .toArray();
  const facet = FacetSchema.parse(result);
  const total = facet.total[0]?.count ?? 0;
  return QuestionPageSchema.parse({
    questions: facet.questions,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / QUESTIONS_PER_PAGE)),
  });
}

import type { Property } from '@prisma/client';
import { prisma } from '../db.js';
import { round2 } from '../lib/money.js';

/**
 * Reputation layer (what Kwentra bought Reflectfy for). A transparent lexicon scorer so the
 * behaviour is explainable and testable; swap in an LLM classifier behind the same signature.
 */
const POSITIVE = ['great', 'excellent', 'amazing', 'clean', 'friendly', 'helpful', 'delicious', 'beautiful', 'perfect', 'love', 'wonderful', 'quick', 'fast', 'comfortable', 'recommend'];
const NEGATIVE = ['dirty', 'rude', 'slow', 'broken', 'noisy', 'cold', 'bad', 'terrible', 'awful', 'wait', 'smell', 'overpriced', 'disappointed', 'never', 'worst'];
const TOPICS: Record<string, string[]> = {
  cleanliness: ['clean', 'dirty', 'smell', 'housekeeping'],
  staff: ['staff', 'friendly', 'rude', 'helpful', 'reception', 'service'],
  food: ['food', 'breakfast', 'restaurant', 'delicious', 'buffet', 'dinner'],
  room: ['room', 'bed', 'shower', 'ac', 'air', 'view', 'noisy', 'comfortable'],
  activities: ['animation', 'activity', 'activities', 'show', 'kids', 'snorkel', 'pool', 'entertainment'],
  value: ['price', 'value', 'overpriced', 'expensive', 'cheap'],
  checkin: ['check-in', 'checkin', 'check in', 'wait', 'queue'],
};

export function scoreText(text: string): { sentiment: number; topics: string[] } {
  const words = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (words.includes(w)) pos++;
  for (const w of NEGATIVE) if (words.includes(w)) neg++;
  const sentiment = pos + neg === 0 ? 0 : round2((pos - neg) / (pos + neg));
  const topics = Object.entries(TOPICS).filter(([, kws]) => kws.some((k) => words.includes(k))).map(([t]) => t);
  return { sentiment, topics };
}

export async function addReview(property: Property, args: { reservationId?: string; source?: string; rating: number; title?: string; body?: string }) {
  const { sentiment, topics } = scoreText(`${args.title ?? ''} ${args.body ?? ''}`);
  return prisma.review.create({ data: { propertyId: property.id, reservationId: args.reservationId, source: args.source ?? 'DIRECT', rating: args.rating, title: args.title ?? '', body: args.body ?? '', sentiment, topics: JSON.stringify(topics) } });
}

export async function reputationSummary(property: Property) {
  const reviews = await prisma.review.findMany({ where: { propertyId: property.id }, orderBy: { createdAt: 'desc' } });
  const avg = reviews.length ? round2(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;
  const topicStats: Record<string, { count: number; sentiment: number }> = {};
  for (const r of reviews) {
    for (const t of JSON.parse(r.topics) as string[]) {
      topicStats[t] ??= { count: 0, sentiment: 0 };
      topicStats[t].count++;
      topicStats[t].sentiment += r.sentiment ?? 0;
    }
  }
  return {
    count: reviews.length,
    averageRating: avg,
    bySource: Object.entries(reviews.reduce<Record<string, number>>((a, r) => ((a[r.source] = (a[r.source] ?? 0) + 1), a), {})).map(([source, count]) => ({ source, count })),
    topics: Object.entries(topicStats).map(([topic, s]) => ({ topic, count: s.count, avgSentiment: round2(s.sentiment / s.count) })).sort((a, b) => b.count - a.count),
    unanswered: reviews.filter((r) => !r.respondedAt && r.rating <= 3).length,
    recent: reviews.slice(0, 10).map((r) => ({ id: r.id, source: r.source, rating: r.rating, title: r.title, sentiment: r.sentiment, topics: JSON.parse(r.topics), createdAt: r.createdAt.toISOString() })),
  };
}

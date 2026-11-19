// Pure game logic: no DOM here, so it runs in the browser and in Node tests.

export const CATEGORIES = ['science', 'geography', 'math', 'popCulture'];

export const AGE_BANDS = [
  { id: '4-5', min: 4, max: 5 },
  { id: '6-7', min: 6, max: 7 },
  { id: '8-9', min: 8, max: 9 },
];

export const DEFAULT_AGE_BAND = '6-7';

// Pop-culture questions are only shown while the topic is still "fresh" for
// the kid: the curator must have confirmed it is popular within this window.
export const FRESHNESS_WINDOW_YEARS = 2;

export const ROUND_LENGTH = 10;

export function bandById(id) {
  return AGE_BANDS.find((b) => b.id === id) || AGE_BANDS.find((b) => b.id === DEFAULT_AGE_BAND);
}

export function fitsAgeBand(question, band) {
  return question.ageRange.min <= band.max && question.ageRange.max >= band.min;
}

function yearsBefore(date, years) {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

export function isFresh(question, today = new Date(), windowYears = FRESHNESS_WINDOW_YEARS) {
  if (question.timeSensitivity !== 'trending') return true;
  const confirmed = question.trend && question.trend.lastConfirmedPopular;
  if (!confirmed) return false;
  return new Date(confirmed) >= yearsBefore(today, windowYears);
}

export function isPlayable(question, today = new Date()) {
  if (!question.safety || question.safety.status !== 'approved') return false;
  if (question.expiresAt && new Date(question.expiresAt) < today) return false;
  return isFresh(question, today);
}

export function eligibleQuestions(questions, { band, category = 'all', today = new Date() }) {
  return questions.filter(
    (q) => isPlayable(q, today) && fitsAgeBand(q, band) && (category === 'all' || q.category === category),
  );
}

export function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Picks a round. In "all" mode it round-robins across categories so a round
// mixes subjects instead of being ten math questions in a row.
export function buildRound(questions, { band, category = 'all', today = new Date(), length = ROUND_LENGTH, rand = Math.random }) {
  const pool = eligibleQuestions(questions, { band, category, today });
  let picked;
  if (category !== 'all') {
    picked = shuffle(pool, rand).slice(0, length);
  } else {
    const buckets = CATEGORIES.map((c) => shuffle(pool.filter((q) => q.category === c), rand));
    picked = [];
    while (picked.length < length && buckets.some((b) => b.length)) {
      for (const b of shuffle(buckets, rand)) {
        if (b.length && picked.length < length) picked.push(b.pop());
      }
    }
    picked = shuffle(picked, rand);
  }
  // True/false keeps its natural order; multiple choice gets shuffled answers.
  return picked.map((q) => ({ ...q, answers: q.type === 'trueFalse' ? q.answers : shuffle(q.answers, rand) }));
}

export function starsFor(score, total) {
  if (!total) return 0;
  const ratio = score / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0) return 1;
  return 0;
}

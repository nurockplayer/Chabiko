import type { APIRoute } from 'astro';
import { loadHskPublication } from '../../../content/loadHskVocabulary';

export function getStaticPaths() {
  return loadHskPublication().pools.map((pool) => ({
    params: { level: String(pool.level) },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const level = Number(params.level);
  const { pools, sourceNotice } = loadHskPublication();
  const pool = pools.find((candidate) => candidate.level === level);
  const entries = !pool || pool.status === 'unavailable'
    ? []
    : pool.fullRange.map((entry) => ({
      id: entry.id,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      japanese: entry.japanese,
    }));

  return new Response(JSON.stringify({ version: 1, entries, notice: sourceNotice }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};

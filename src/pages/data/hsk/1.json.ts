import type { APIRoute } from 'astro';
import { loadHskLevelEntries } from '../../../content/loadHskVocabulary';

export const GET: APIRoute = () => {
  const payload = {
    version: 1,
    entries: loadHskLevelEntries(1),
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};

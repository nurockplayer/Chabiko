import type { APIRoute } from 'astro';
import {
  buildV2ReferenceAnswerPayload,
  loadV2ReferenceContent,
} from '../../../content/v2Reference';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(buildV2ReferenceAnswerPayload(loadV2ReferenceContent())),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    },
  );

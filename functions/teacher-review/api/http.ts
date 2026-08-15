/** Minimal JSON helpers for the teacher-review Pages Functions boundary. */

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

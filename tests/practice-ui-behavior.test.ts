import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/components/LessonPractice.astro', import.meta.url),
  'utf8',
);

function linesBetween(start: string, end: string): string {
  const s = source.indexOf(start);
  const e = source.indexOf(end, s + 1);
  return s >= 0 && e > s ? source.slice(s, e) : '';
}

describe('LessonPractice pageshow handler', () => {
  const section = linesBetween(
    "window.addEventListener('pageshow'",
    "// Cross-tab storage synchronisation.",
  );

  it('clears timer and rebuilds store on every return', () => {
    expect(section).toContain('timer.clear();');
    expect(section).toContain('store = new ProgressStore();');
  });

  it('shows completion UI when storage says completed', () => {
    expect(section).toContain("store.isComplete(session.lessonId)");
    expect(section).toContain('syncBadge()');
  });

  it('creates new session when completed lesson was reset externally', () => {
    expect(section).toContain("session.status === 'completed'");
    expect(section).toContain('createSession(questions)');
  });

  it('does not unconditionally createSession for active sessions', () => {
    // Find the active-session branch in pageshow:
    // the else branch that preserves currentIndex should NOT call createSession
    const activeBranchEnd = source.indexOf('// Cross-tab storage synchronisation.');
    const activeBranch = source.slice(
      source.indexOf(
        "} else {\n        // Active session: preserve currentIndex, just re-render UI",
      ),
      activeBranchEnd,
    );
    expect(activeBranch).not.toContain('createSession');
  });

  it('clears badge in active branch when it was previously completed', () => {
    const activeBranchEnd = source.indexOf('// Cross-tab storage synchronisation.');
    const activeBranch = source.slice(
      source.indexOf(
        "} else {\n        // Active session: preserve currentIndex",
      ),
      activeBranchEnd,
    );
    expect(activeBranch).toContain("badge.textContent = ''");
    expect(activeBranch).toContain("badge.className = 'completion-badge'");
    expect(activeBranch).toContain('render();');
  });
});

describe('LessonPractice storage event handler', () => {
  // The storage handler spans from the addEventListener to the closing of the IIFE
  const section = linesBetween(
    "window.addEventListener('storage'",
    '</script>',
  );

  it('delegates to handleProgressStorageEvent for key filtering', () => {
    expect(section).toContain('handleProgressStorageEvent(event,');
  });

  it('shows completion UI when cross-tab completed this lesson', () => {
    expect(section).toContain("store.isComplete(session.lessonId)");
    expect(section).toContain('practice-complete');
  });

  it('creates new session when cross-tab reset a completed lesson', () => {
    expect(section).toContain("session.status === 'completed'");
    expect(section).toContain('createSession(questions)');
  });

  it('preserves active session and clears badge on storage event', () => {
    const section = linesBetween(
      "} else {\n          // Active session: another tab",
      "</script>",
    );
    expect(section).toContain(
      '// Active session: another tab completed or reset a different',
    );
    expect(section).toContain("badge.textContent = ''");
    expect(section).toContain('render();');
  });
});

describe('LessonPractice imports handleProgressStorageEvent', () => {
  it('imports handleProgressStorageEvent from progressSnapshot', () => {
    expect(source).toContain(
      "import { handleProgressStorageEvent } from '../lib/progressSnapshot';",
    );
  });
});

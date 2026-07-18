import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTimeoutManager } from '../src/lib/timeoutManager';

describe('timeoutManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes scheduled callback after delay', () => {
    const tm = createTimeoutManager();
    const fn = vi.fn();

    tm.schedule(fn, 100);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clears pending timeout and it never fires', () => {
    const tm = createTimeoutManager();
    const fn = vi.fn();

    tm.schedule(fn, 100);
    tm.clear();

    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clear is safe when no timeout is pending', () => {
    const tm = createTimeoutManager();
    expect(() => tm.clear()).not.toThrow();
  });

  it('scheduling a second timeout clears the first (only second fires)', () => {
    const tm = createTimeoutManager();
    const first = vi.fn();
    const second = vi.fn();

    tm.schedule(first, 100);
    tm.schedule(second, 100);

    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('isPending returns true when timeout is active', () => {
    const tm = createTimeoutManager();
    expect(tm.isPending()).toBe(false);

    tm.schedule(() => {}, 100);
    expect(tm.isPending()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(tm.isPending()).toBe(false);
  });

  it('isPending returns false after clear', () => {
    const tm = createTimeoutManager();
    tm.schedule(() => {}, 100);
    tm.clear();
    expect(tm.isPending()).toBe(false);
  });

  it('multiple clear calls do not throw or leak', () => {
    const tm = createTimeoutManager();
    tm.schedule(() => {}, 100);
    tm.clear();
    tm.clear();
    tm.clear();
    expect(tm.isPending()).toBe(false);
  });
});

describe('pageshow lifecycle — stale callback prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correct-answer callback cancelled by pageshow/reset never fires', () => {
    const tm = createTimeoutManager();
    const completionCallback = vi.fn();
    const renderCallback = vi.fn();

    // Simulate last-correct-answer → completion timeout scheduled
    tm.schedule(completionCallback, 1200);

    // pageshow/reset happens
    tm.clear();
    // Re-render first question
    tm.schedule(renderCallback, 0);

    vi.advanceTimersByTime(2000);

    // Only the re-render should have fired
    expect(completionCallback).not.toHaveBeenCalled();
    expect(renderCallback).toHaveBeenCalledTimes(1);
  });

  it('incorrect-answer callback cancelled by pageshow/reset never fires', () => {
    const tm = createTimeoutManager();
    const retryCallback = vi.fn();
    const renderCallback = vi.fn();

    // Simulate wrong answer → retry timeout
    tm.schedule(retryCallback, 2000);

    // pageshow/reset
    tm.clear();
    tm.schedule(renderCallback, 0);

    vi.advanceTimersByTime(3000);

    expect(retryCallback).not.toHaveBeenCalled();
    expect(renderCallback).toHaveBeenCalledTimes(1);
  });

  it('multiple pageshow events do not accumulate pending timers', () => {
    const tm = createTimeoutManager();
    const cb = vi.fn();

    tm.schedule(cb, 100);
    tm.clear(); // first pageshow
    tm.schedule(cb, 100);
    tm.clear(); // second pageshow
    tm.schedule(cb, 100);
    tm.clear(); // third pageshow

    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    expect(tm.isPending()).toBe(false);
  });

  it('normal correct-answer flow still works', () => {
    const tm = createTimeoutManager();
    const cb = vi.fn();

    tm.schedule(cb, 1200);
    vi.advanceTimersByTime(1199);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('normal incorrect-answer retry flow still works', () => {
    const tm = createTimeoutManager();
    const cb = vi.fn();

    tm.schedule(cb, 2000);
    vi.advanceTimersByTime(1999);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

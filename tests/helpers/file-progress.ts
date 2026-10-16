import type { Reporter } from 'vitest/reporters';

export default class FileProgress implements Reporter {
  onCollected: Reporter['onCollected'] = (files) => {
    for (const file of files ?? []) {
      // The default reporter prints only after a file finishes. Name the active
      // file before synchronous subprocess tests can block its worker for minutes.
      console.info(`[unit] ${file.name}`);
    }
  };
}

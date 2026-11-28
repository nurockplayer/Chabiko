import type { Reporter, TestModule } from 'vitest/node';

export default class FileProgress implements Reporter {
  onTestModuleCollected(file: TestModule) {
    // The default reporter prints only after a file finishes. Name the active
    // file before synchronous subprocess tests can block its worker for minutes.
    console.info(`[unit] ${file.relativeModuleId}`);
  }
}

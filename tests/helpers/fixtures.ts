import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

export async function createTempDir(prefix = 'agent-team-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Path to `tests/v9/fixtures` from repo root */
export function v9FixturesDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'v9', 'fixtures');
}

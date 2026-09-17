import { createTauriHost } from './tauri.js';
import { createMockHost } from './mock.js';

/** Pick the real host when running inside SPECIMEN, the mock one otherwise. */
export async function createHost(root, opts) {
  const real = await createTauriHost();
  if (real) return real;
  return createMockHost(root, opts);
}

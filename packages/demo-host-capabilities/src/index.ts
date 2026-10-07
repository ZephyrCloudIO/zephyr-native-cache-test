import {getNativeMFECache} from './native';
import type {NativeMFECacheSpec} from './native';

export interface DemoMessage {
  message: string;
  sha256: string;
}

const relativePath = 'zephyr-build-once-demo/message.txt';
const digestPattern = /^[a-f0-9]{64}$/;
async function getMessagePath(): Promise<{native: NativeMFECacheSpec; path: string}> {
  const native = getNativeMFECache();
  const directory = await native.getDocumentDirectory();
  if (!directory) throw new Error('Native document directory is unavailable');
  return {native, path: `${directory.replace(/\/$/, '')}/${relativePath}`};
}

export async function saveDemoMessage(message: string): Promise<DemoMessage> {
  const {native, path} = await getMessagePath();
  await native.writeFile(path, message, 'utf8');
  const stored = await native.readFile(path, 'utf8');
  if (stored !== message) throw new Error('Native message write did not persist the requested contents');
  const sha256 = await native.sha256File(path);
  if (!digestPattern.test(sha256)) throw new Error('Native message hash is not a lowercase SHA-256 digest');
  return {message: stored, sha256};
}

export async function readDemoMessage(): Promise<DemoMessage | null> {
  const {native, path} = await getMessagePath();
  if (!(await native.fileExists(path))) return null;
  const message = await native.readFile(path, 'utf8');
  const sha256 = await native.sha256File(path);
  if (!digestPattern.test(sha256)) throw new Error('Native message hash is not a lowercase SHA-256 digest');
  return {message, sha256};
}

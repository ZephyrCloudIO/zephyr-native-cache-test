import {createHash} from 'node:crypto';
import {readDemoMessage, saveDemoMessage} from '@zephyr-demo/host-capabilities';
import type {NativeMFECacheSpec} from '@zephyr-demo/host-capabilities/native';

const mockNative: {current?: NativeMFECacheSpec} = {};
jest.mock('@zephyr-demo/host-capabilities/native', () => ({
  getNativeMFECache: () => {
    if (!mockNative.current) throw new Error('Native MFECache module is unavailable');
    return mockNative.current;
  },
}));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('demo native persistence', () => {
  let files: Map<string, string>;
  let native: NativeMFECacheSpec;
  const path = '/documents/zephyr-build-once-demo/message.txt';

  beforeEach(() => {
    files = new Map();
    native = {
      getDocumentDirectory: jest.fn(async () => '/documents'),
      fileExists: jest.fn(async filePath => files.has(filePath)),
      readFile: jest.fn(async filePath => files.get(filePath) ?? ''),
      writeFile: jest.fn(async (filePath, contents) => { files.set(filePath, contents); }),
      sha256File: jest.fn(async filePath => sha256(files.get(filePath) ?? '')),
      sha256String: jest.fn(async value => sha256(value)),
    };
    mockNative.current = native;
  });

  afterEach(() => {
    delete mockNative.current;
  });

  it('persists exact UTF-8 content and verifies it through a fresh read', async () => {
    const message = 'Hello from RN 🌿';
    await expect(saveDemoMessage(message)).resolves.toEqual({message, sha256: sha256(message)});
    expect(files.get(path)).toBe(message);
    await expect(readDemoMessage()).resolves.toEqual({message, sha256: sha256(message)});
    expect(native.readFile).toHaveBeenCalledWith(path, 'utf8');
    expect(native.writeFile).toHaveBeenCalledWith(path, message, 'utf8');
  });

  it('returns null only when the backing file is absent', async () => {
    await expect(readDemoMessage()).resolves.toBeNull();
    files.set(path, 'persisted');
    await expect(readDemoMessage()).resolves.toEqual({message: 'persisted', sha256: sha256('persisted')});
  });

  it('detects a native write that reports success without persisting bytes', async () => {
    native.writeFile = jest.fn(async () => undefined);
    await expect(saveDemoMessage('not actually stored')).rejects.toThrow('Native message write did not persist the requested contents');
  });

  it('rejects when the native cache capability is unavailable', async () => {
    delete mockNative.current;
    await expect(saveDemoMessage('x')).rejects.toThrow('Native MFECache module is unavailable');
  });
});

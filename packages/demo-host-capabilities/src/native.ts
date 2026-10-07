import {NativeModules} from 'react-native';

export interface NativeMFECacheSpec {
  getDocumentDirectory(): Promise<string>;
  writeFile(path: string, content: string, encoding: 'utf8' | 'base64'): Promise<void>;
  readFile(path: string, encoding: 'utf8' | 'base64'): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  sha256File(path: string): Promise<string>;
  sha256String(content: string): Promise<string>;
}

const unavailable = 'Host native capability MFECache is unavailable';
const requiredMethods = [
  'getDocumentDirectory',
  'writeFile',
  'readFile',
  'fileExists',
  'sha256File',
  'sha256String',
] as const;

export function getNativeMFECache(): NativeMFECacheSpec {
  const native = NativeModules.MFECache as Partial<NativeMFECacheSpec> | undefined;
  if (!native || requiredMethods.some(method => typeof native[method] !== 'function')) {
    throw new Error(unavailable);
  }
  return native as NativeMFECacheSpec;
}

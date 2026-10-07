import {execa} from 'execa';
import {existsSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {execArgs} from './e2e-runtime.js';
export interface DemoDevice {
  platform: 'ios' | 'android';
  id: string;
  appId: string;
}

export function findIosAppPath(): string {
  const derivedData = join(process.env.HOME ?? '', 'Library/Developer/Xcode/DerivedData');
  if (!existsSync(derivedData)) throw new Error(`DerivedData not found at ${derivedData}`);
  const candidates = readdirSync(derivedData)
    .filter(directory => directory.startsWith('MFExampleHost-'))
    .map(directory => ({path: join(derivedData, directory), mtime: statSync(join(derivedData, directory)).mtimeMs}))
    .sort((left, right) => right.mtime - left.mtime);
  for (const {path} of candidates) {
    const products = join(path, 'Build/Products/Release-iphonesimulator');
    if (!existsSync(products)) continue;
    const app = readdirSync(products).find(name => name.endsWith('.app'));
    if (app) return join(products, app);
  }
  throw new Error('No built MFExampleHost.app found under DerivedData — run the Build step first');
}

export function androidApkPath(hostDir: string): string {
  return join(hostDir, 'android/app/build/outputs/apk/release/app-release.apk');
}

export async function uninstallDemoDevice(
  device: DemoDevice,
  cwd: string,
  onCommand?: (command: string, argv: string[]) => void,
): Promise<void> {
  const present = device.platform === 'ios'
    ? await execa('xcrun', ['simctl', 'get_app_container', device.id, device.appId], {cwd, reject: false})
    : await execa('adb', ['-s', device.id, 'shell', 'pm', 'path', device.appId], {cwd, reject: false});
  if (present.exitCode !== 0) return;
  const binary = device.platform === 'ios' ? 'xcrun' : 'adb';
  const argv = device.platform === 'ios'
    ? ['simctl', 'uninstall', device.id, device.appId]
    : ['-s', device.id, 'uninstall', device.appId];
  onCommand?.(binary, argv);
  await execa(binary, argv, {cwd});
}

export async function installDemoDevice(
  device: DemoDevice,
  artifactPath: string,
  cwd: string,
  onCommand?: (command: string, argv: string[]) => void,
): Promise<void> {
  const binary = device.platform === 'ios' ? 'xcrun' : 'adb';
  const argv = device.platform === 'ios'
    ? ['simctl', 'install', device.id, artifactPath]
    : ['-s', device.id, 'install', artifactPath];
  onCommand?.(binary, argv);
  await execArgs(binary, argv, () => {}, {cwd});
}

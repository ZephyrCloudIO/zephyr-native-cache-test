export interface DemoManifestRecord {
  remoteName: 'mini' | 'nestedMini';
  manifestUrl: string;
  source: 'network' | 'native-cache';
  executableHashes: Record<string, string>;
  executableArtifactSetId: string;
}

type ManifestSnapshot = Readonly<Partial<Record<'mini' | 'nestedMini', DemoManifestRecord>>>;
const listeners = new Set<() => void>();
let snapshot: ManifestSnapshot = Object.freeze({});

export function recordDemoManifest(record: DemoManifestRecord): void {
  const current = snapshot[record.remoteName];
  if (current && current.manifestUrl === record.manifestUrl && current.source === record.source && current.executableArtifactSetId === record.executableArtifactSetId && JSON.stringify(current.executableHashes) === JSON.stringify(record.executableHashes)) return;
  snapshot = Object.freeze({...snapshot, [record.remoteName]: Object.freeze({...record, executableHashes: Object.freeze({...record.executableHashes})})});
  for (const listener of listeners) listener();
}

export function subscribeDemoManifests(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getDemoManifestSnapshot(): ManifestSnapshot {
  return snapshot;
}

export async function probeDemoNetwork(): Promise<'reachable' | 'unreachable'> {
  const known = Object.values(snapshot).find((record): record is DemoManifestRecord => record !== undefined);
  if (!known) throw new Error('No remote manifest has been loaded');
  const url = new URL(known.manifestUrl);
  url.searchParams.set('buildOnceProbe', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(url.toString(), {method: 'GET', cache: 'no-store', headers: {'cache-control': 'no-cache, no-store', pragma: 'no-cache'}, signal: controller.signal});
    return 'reachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

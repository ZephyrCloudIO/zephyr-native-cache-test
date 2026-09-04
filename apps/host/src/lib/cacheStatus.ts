import type {CacheStatusRemoteEntry} from 'zephyr-native-cache';

export function findEntry(
  remotes: Record<string, CacheStatusRemoteEntry>,
  name: string,
): CacheStatusRemoteEntry | undefined {
  return (
    remotes[name] ??
    Object.values(remotes).find(
      entry =>
        entry.remoteName.endsWith('/' + name) || entry.remoteName === name,
    )
  );
}

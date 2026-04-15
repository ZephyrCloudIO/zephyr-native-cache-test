import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  BundleLoadEvent,
  PollCompleteEvent,
  UpdateAvailableEvent,
} from 'zephyr-native-cache';

export interface RemoteCacheEntry {
  remoteName: string;
  bundleUrl: string;
  status: 'cache-hit' | 'downloaded' | 'skipped' | 'pending';
  hash: string | undefined;
  loadedAt: number | undefined;
}

export interface CacheStatusState {
  remotes: Record<string, RemoteCacheEntry>;
  pollingEnabled: boolean;
  pollIntervalMs: number;
  isPolling: boolean;
  lastPollAt: number | undefined;
  lastPollResult: {checked: number; updated: number} | undefined;
  pendingUpdates: string[];
}

export interface CacheStatusResult {
  status: CacheStatusState;
  latestUpdateEvent: UpdateAvailableEvent | null;
  clearUpdateNotification: () => void;
}

function getCacheLayer(): any {
  return (globalThis as any).__FEDERATION__?.__NATIVE__?.__CACHE_LAYER__;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

const INITIAL_STATE: CacheStatusState = {
  remotes: {},
  pollingEnabled: false,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  isPolling: false,
  lastPollAt: undefined,
  lastPollResult: undefined,
  pendingUpdates: [],
};

export function useCacheStatus(): CacheStatusResult {
  const [state, setState] = useState<CacheStatusState>(INITIAL_STATE);
  const [latestUpdateEvent, setLatestUpdateEvent] =
    useState<UpdateAvailableEvent | null>(null);
  const mountedRef = useRef(true);

  const clearUpdateNotification = useCallback(() => {
    setLatestUpdateEvent(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const cacheLayer = getCacheLayer();
    if (!cacheLayer?.events) return;

    // Assume polling is active from startup — register() starts it before React mounts.
    // Use now as lastPollAt so the countdown and progress bar render immediately.
    setState(prev => ({
      ...prev,
      pollingEnabled: true,
      lastPollAt: Date.now(),
    }));

    // Replay buffered load events that fired before React mounted
    const sessionEvents = cacheLayer.events?.drainLoadEvents?.() ?? [];
    if (sessionEvents.length > 0) {
      const remotes: Record<string, RemoteCacheEntry> = {};
      for (const e of sessionEvents) {
        remotes[e.remoteName] = {
          remoteName: e.remoteName,
          bundleUrl: e.bundleUrl,
          status: e.status,
          hash: e.hash?.slice(0, 8),
          loadedAt: e.timestamp,
        };
      }
      setState(prev => ({...prev, remotes}));
    }

    // Subscribe to live events
    const onBundleLoad = (e: BundleLoadEvent) => {
      if (!mountedRef.current) return;
      setState(prev => ({
        ...prev,
        remotes: {
          ...prev.remotes,
          [e.remoteName]: {
            remoteName: e.remoteName,
            bundleUrl: e.bundleUrl,
            status: e.status,
            hash: e.hash?.slice(0, 8),
            loadedAt: e.timestamp,
          },
        },
      }));
    };

    const onPollStart = () => {
      if (!mountedRef.current) return;
      setState(prev => ({...prev, pollingEnabled: true, isPolling: true}));
    };

    const onPollComplete = (e: PollCompleteEvent) => {
      if (!mountedRef.current) return;
      setState(prev => ({
        ...prev,
        isPolling: false,
        lastPollAt: e.timestamp,
        lastPollResult: {checked: e.checked, updated: e.updated},
      }));
    };

    const onUpdateAvailable = (e: UpdateAvailableEvent) => {
      if (!mountedRef.current) return;
      setState(prev => ({
        ...prev,
        pendingUpdates: prev.pendingUpdates.includes(e.remoteName)
          ? prev.pendingUpdates
          : [...prev.pendingUpdates, e.remoteName],
      }));
      setLatestUpdateEvent(e);
    };

    cacheLayer.events.on('bundle:load', onBundleLoad);
    cacheLayer.events.on('poll:start', onPollStart);
    cacheLayer.events.on('poll:complete', onPollComplete);
    cacheLayer.events.on('update:available', onUpdateAvailable);

    return () => {
      mountedRef.current = false;
      cacheLayer.events.off('bundle:load', onBundleLoad);
      cacheLayer.events.off('poll:start', onPollStart);
      cacheLayer.events.off('poll:complete', onPollComplete);
      cacheLayer.events.off('update:available', onUpdateAvailable);
    };
  }, []);

  return {status: state, latestUpdateEvent, clearUpdateNotification};
}

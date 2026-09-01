import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  CacheStatusRemoteEntry,
  CacheStatusSnapshot,
} from 'zephyr-native-cache';
import {Button} from './Button';

interface DevToolsPanelProps {
  status: CacheStatusSnapshot;
  pollIntervalMs: number;
  lastPollAt: number | undefined;
  showSources: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onCheckUpdates: () => void;
  onClearCache: () => void;
  onToggleSources: () => void;
}

const COLLAPSED_HEIGHT = 46;
const EXPANDED_HEIGHT = 360;

const STATUS_COLORS: Record<string, string> = {
  'cache-hit': '#22c55e',
  downloaded: '#3b82f6',
  skipped: '#6b7280',
  pending: '#eab308',
};

const STATUS_LABELS: Record<string, string> = {
  'cache-hit': 'cache',
  downloaded: 'remote',
  skipped: 'remote',
  pending: 'pending',
};

// Derive a human-readable label for a remote/exposed bundle. Tries the
// inferred `remoteName` first (e.g. `"mini"` for a container, `"exposed/StatsCard"`
// for an exposed module); falls back to the `bundleUrl` last path segment so
// rows never render as blank text when inference lands on an empty string.
function displayName({remoteName, bundleUrl}: CacheStatusRemoteEntry): string {
  const lastSegment = (raw: string): string => {
    const parts = raw.split('/').filter(Boolean);
    const last = parts.pop() ?? '';
    return last.split('.')[0].split('?')[0];
  };
  const fromRemote = lastSegment(remoteName);
  if (fromRemote) {
    const isContainer = !remoteName.includes('/');
    return isContainer ? `${fromRemote} (entry)` : fromRemote;
  }
  try {
    const url = new URL(bundleUrl);
    const fromPath = lastSegment(url.pathname);
    if (fromPath) return `${fromPath} (entry)`;
    const host = url.hostname.split('.')[0];
    if (host) return `${host} (entry)`;
  } catch {
    /* not a parseable URL — fall through */
  }
  return '(unknown)';
}

function relativeTime(timestamp: number | undefined): string {
  if (!timestamp) return '—';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function PollProgressBar({
  pollingEnabled,
  isPolling,
  pollIntervalMs,
  lastPollAt,
}: {
  pollingEnabled: boolean;
  isPolling: boolean;
  pollIntervalMs: number;
  lastPollAt: number | undefined;
}) {
  const width = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const prevLastPollAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    animRef.current?.stop();
    if (!pollingEnabled || !lastPollAt) { width.setValue(0); flash.setValue(0); return; }
    if (isPolling) {
      Animated.timing(width, {toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: false}).start();
      return;
    }
    const isNewPoll = prevLastPollAt.current !== undefined && prevLastPollAt.current !== lastPollAt;
    prevLastPollAt.current = lastPollAt;
    if (isNewPoll) {
      width.setValue(1); flash.setValue(0);
      animRef.current = Animated.sequence([
        Animated.timing(flash, {toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: false}),
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(flash, {toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false}),
          Animated.timing(width, {toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false}),
        ]),
        Animated.timing(width, {toValue: 1, duration: Math.max(pollIntervalMs - 1200, 0), easing: Easing.linear, useNativeDriver: false}),
      ]);
      animRef.current.start();
    } else {
      flash.setValue(0);
      const elapsed = Date.now() - lastPollAt;
      width.setValue(Math.min(elapsed / pollIntervalMs, 1));
      animRef.current = Animated.timing(width, {toValue: 1, duration: Math.max(pollIntervalMs - elapsed, 0), easing: Easing.linear, useNativeDriver: false});
      animRef.current.start();
    }
    return () => animRef.current?.stop();
  }, [pollingEnabled, isPolling, pollIntervalMs, lastPollAt, width, flash]);

  if (!pollingEnabled) return null;
  const bgColor = flash.interpolate({inputRange: [0, 1], outputRange: ['rgba(139, 92, 246, 0.4)', 'rgba(34, 197, 94, 0.8)']});

  return (
    <View style={pollBarStyles.track}>
      <Animated.View
        style={[pollBarStyles.fill, isPolling && pollBarStyles.fillActive, {backgroundColor: bgColor, width: width.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']})}]}
      />
    </View>
  );
}

const pollBarStyles = StyleSheet.create({
  track: {height: 2, backgroundColor: 'rgba(139, 92, 246, 0.1)', overflow: 'hidden'},
  fill: {height: '100%', backgroundColor: 'rgba(139, 92, 246, 0.4)', borderRadius: 1},
  fillActive: {backgroundColor: '#8b5cf6'},
});

function useCountdown(lastPollAt: number | undefined, pollIntervalMs: number) {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!lastPollAt) { setSecondsLeft(null); return; }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((lastPollAt + pollIntervalMs - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastPollAt, pollIntervalMs]);
  return secondsLeft;
}

export function DevToolsPanel({
  status,
  pollIntervalMs,
  lastPollAt,
  showSources,
  expanded,
  onToggleExpanded,
  onCheckUpdates,
  onClearCache,
  onToggleSources,
}: DevToolsPanelProps) {
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const secondsLeft = useCountdown(lastPollAt, pollIntervalMs);

  useEffect(() => {
    Animated.spring(animatedHeight, {
      toValue: expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
      useNativeDriver: false,
      tension: 80,
      friction: 14,
    }).start();
  }, [expanded, animatedHeight]);

  const remoteEntries = Object.values(status.remotes);

  return (
    <Animated.View style={[styles.container, {height: animatedHeight}]}>
      <PollProgressBar
        pollingEnabled={status.pollingEnabled}
        isPolling={status.isPolling}
        pollIntervalMs={pollIntervalMs}
        lastPollAt={lastPollAt}
      />
      {/* Handle */}
      <View style={styles.handle}>
        <View style={styles.statusInfo}>
          <Text style={[styles.dimLabel, styles.mono]}>module cache</Text>
          {status.pollingEnabled && (
            <>
              <Text style={[styles.dimLabel, styles.mono]}>·</Text>
              {secondsLeft !== null && !status.isPolling ? (
                <Text style={[styles.dimLabel, styles.mono]}>
                  polling <Text style={styles.brightLabel}>{secondsLeft}s</Text>
                </Text>
              ) : status.isPolling ? (
                <Text style={[styles.dimLabel, styles.mono]}>polling...</Text>
              ) : null}
            </>
          )}
        </View>
        <View style={styles.quickActions}>
          <Button
            onPress={onToggleExpanded}
            style={styles.quickButton}
            accessibilityLabel={expanded ? 'Collapse module diagnostics' : 'Expand module diagnostics'}
            testID="devtools-panel-handle">
            <Text style={styles.quickIcon}>⌞⌝</Text>
          </Button>
          <Button
            onPress={onToggleSources}
            accessibilityLabel={showSources ? 'Hide module sources' : 'Show module sources'}
            testID="devtools-toggle-sources"
            style={[
              styles.quickButton,
              showSources && styles.quickButtonActive,
            ]}>
            <Text
              style={[
                styles.quickIcon,
                showSources && styles.quickIconActive,
              ]}>
              ◉
            </Text>
          </Button>
          <Button
            onPress={onCheckUpdates}
            style={styles.quickButton}
            disabled={status.isPolling}
            accessibilityLabel="Check for module updates"
            testID="devtools-check-updates">
            <Text
              style={[
                styles.quickIcon,
                status.isPolling && styles.quickIconDisabled,
              ]}>
              ↻
            </Text>
          </Button>
          <Button
            onPress={onClearCache}
            style={styles.quickButton}
            accessibilityLabel="Clear downloaded module cache"
            testID="devtools-clear-cache">
            <Text style={[styles.quickIcon, styles.quickIconDanger]}>✕</Text>
          </Button>
        </View>
      </View>

      {/* Expanded content */}
      {expanded && (
        <ScrollView style={styles.content} testID="devtools-panel-expanded">
          {/* Status */}
          <Text style={styles.sectionTitle}>STATUS</Text>
          {status.lastPollAt && (
            <View style={styles.statusRow}>
              <Text style={styles.statusKey}>Last check</Text>
              <Text style={styles.statusValue}>
                {relativeTime(status.lastPollAt)}
                {status.lastPollResult
                  ? ` · ${status.lastPollResult.checked} checked, ${status.lastPollResult.updated} updated`
                  : ''}
              </Text>
            </View>
          )}
          {status.pendingUpdates.length > 0 && (
            <View style={styles.statusRow}>
              <Text style={styles.statusKey}>Pending</Text>
              <Text style={[styles.statusValue, {color: '#eab308'}]}>
                {status.pendingUpdates.join(', ')}
              </Text>
            </View>
          )}

          {/* Remotes */}
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>REMOTES</Text>
          {remoteEntries.length === 0 ? (
            <Text style={styles.emptyText}>No bundles loaded yet</Text>
          ) : (
            remoteEntries.map(entry => (
              <View key={entry.remoteName} style={styles.remoteRow}>
                <Text style={[styles.remoteName, styles.mono]} numberOfLines={1}>
                  {displayName(entry)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: `${STATUS_COLORS[entry.status] ?? '#6b7280'}20`,
                    },
                  ]}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          STATUS_COLORS[entry.status] ?? '#6b7280',
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      {color: STATUS_COLORS[entry.status] ?? '#6b7280'},
                    ]}>
                    {STATUS_LABELS[entry.status] ?? entry.status}
                  </Text>
                </View>
                <Text style={[styles.hash, styles.mono]}>
                  {entry.hash ? `#${entry.hash}` : '—'}
                </Text>
              </View>
            ))
          )}

          {/* Controls */}
          <View style={styles.divider} />
          <View style={styles.controls}>
            <Button
              onPress={onToggleSources}
              accessibilityLabel={showSources ? 'Hide module sources' : 'Show module sources'}
              style={[
                styles.controlButton,
                showSources && styles.controlButtonActive,
              ]}>
              <Text
                style={[
                  styles.controlText,
                  showSources && styles.controlTextActive,
                ]}>
                {showSources ? 'Hide Sources' : 'Show Sources'}
              </Text>
            </Button>
            <Button
              onPress={onCheckUpdates}
              accessibilityLabel="Check for module updates"
              style={styles.controlButton}
              disabled={status.isPolling}>
              <Text
                style={[
                  styles.controlText,
                  status.isPolling && styles.controlTextDisabled,
                ]}>
                Check Updates
              </Text>
            </Button>
            <Button
              onPress={onClearCache}
              accessibilityLabel="Clear downloaded module cache"
              style={[styles.controlButton, styles.destructiveButton]}>
              <Text style={styles.destructiveText}>Clear</Text>
            </Button>
          </View>
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 34,
    backgroundColor: 'rgba(9, 9, 11, 0.97)',
    borderTopWidth: 1,
    zIndex: 200,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  handle: {
    height: COLLAPSED_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  statusInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dimLabel: {
    color: '#6b7280',
  },
  brightLabel: {
    color: '#d4d4d8',
    fontWeight: '600',
  },
  separator: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },
  quickActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  quickButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickButtonActive: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  quickIcon: {
    color: '#6b7280',
    fontSize: 14,
  },
  quickIconActive: {
    color: '#a78bfa',
  },
  quickIconDisabled: {
    opacity: 0.3,
  },
  quickIconDanger: {
    color: '#ef4444',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  emptyText: {
    color: '#4b5563',
    fontSize: 12,
    fontStyle: 'italic',
  },
  remoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  remoteName: {
    color: '#d4d4d8',
    fontSize: 11,
    flex: 1,
    marginRight: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  hash: {
    color: '#6b7280',
    fontSize: 10,
    marginRight: 6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  statusKey: {
    color: '#6b7280',
    fontSize: 12,
    width: 80,
  },
  statusValue: {
    color: '#a1a1aa',
    fontSize: 12,
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8b5cf6',
  },
  controlText: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '600',
  },
  controlTextActive: {
    color: '#a78bfa',
  },
  controlTextDisabled: {
    opacity: 0.4,
  },
  destructiveButton: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  destructiveText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  mono: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

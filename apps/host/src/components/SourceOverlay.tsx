import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';
import type {RemoteCacheEntry} from '../hooks/useCacheStatus';
import {versionColor} from '../version-palette';

const ORIGINS = {
  mini: {color: '#8b5cf6', label: 'mini'},
  nestedMini: {color: '#14b8a6', label: 'nestedMini'},
  host: {color: '#f59e0b', label: 'host'},
} as const;

const SOURCE_LABELS: Record<string, string> = {
  'cache-hit': 'from cache',
  downloaded: 'from network',
  skipped: 'from network',
  pending: 'loading...',
};

export function SourceOverlay({
  origin,
  name,
  entry,
  loading = 'lazy',
  version,
}: {
  origin: keyof typeof ORIGINS;
  name: string;
  entry?: RemoteCacheEntry;
  loading?: 'eager' | 'lazy' | 'on-demand';
  version?: string;
}) {
  const {color, label} = ORIGINS[origin];
  const isNotLoaded = loading === 'on-demand' && !entry;
  const sourceText = isNotLoaded
    ? 'not loaded'
    : entry
      ? SOURCE_LABELS[entry.status]
      : origin === 'host'
        ? 'local component'
        : '';
  return (
    <View style={[styles.container, {borderColor: color}]}>
      {/* Top-right version badge — mirrors the position used inside each
          remote component's card so the operator sees the same label in the
          same spot regardless of whether the overlay is covering the content. */}
      {version && (
        <Text style={[styles.versionBadge, {color: versionColor(version)}]}>
          {version}
        </Text>
      )}
      <Text style={styles.name}>{name}</Text>
      <View
        style={[
          styles.pill,
          {backgroundColor: color + '20', borderColor: color + '40'},
        ]}>
        <Text style={[styles.pillText, {color}]}>{label}</Text>
      </View>
      <View style={styles.metaRow}>
        {sourceText !== '' && (
          <Text style={styles.meta}>{sourceText}</Text>
        )}
        <Text style={styles.meta}> · </Text>
        <Text style={styles.meta}>{loading}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 9, 11, 0.95)',
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  versionBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  name: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    textAlign: 'center',
    marginBottom: 6,
  },
  pill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

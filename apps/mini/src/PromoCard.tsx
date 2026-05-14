import React, {useEffect, useState} from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

type Props = {
  testID?: string;
};

const VERSION = 'v1.0.0';
const ACCENT = '#8b5cf6';

function getFirstBundleHash(): string | undefined {
  const hashes = globalThis.__ZEPHYR__?.runtime?.nativeCache?.refs?.bundleHashes;
  if (!hashes) return undefined;
  const keys = Object.keys(hashes);
  if (keys.length === 0) return undefined;
  return hashes[keys[0]]?.slice(0, 8);
}

export default function PromoCard({testID = 'promo-card'}: Props) {
  const [hash, setHash] = useState<string | undefined>(getFirstBundleHash);

  useEffect(() => {
    // Retry once after a short delay in case hashes aren't populated yet
    if (!hash) {
      const timer = setTimeout(() => setHash(getFirstBundleHash()), 1000);
      return () => clearTimeout(timer);
    }
  }, [hash]);

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.versionBadge}>
            <Text style={[styles.versionText, styles.mono]}>{VERSION}</Text>
          </View>
          <Text style={styles.remoteName}>mini</Text>
        </View>
        <Text style={styles.headline}>Introducing Edge Caching</Text>
        <Text style={styles.body}>
          Ship updates instantly. No app store. No waiting. Your React Native
          micro-frontends update over the air with native-speed caching.
        </Text>
        {hash && (
          <View style={styles.footer}>
            <Text style={[styles.hashLabel, styles.mono]}>bundle</Text>
            <Text style={[styles.hashValue, styles.mono]}>#{hash}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f0f13',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    backgroundColor: ACCENT,
  },
  content: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  versionBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  versionText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
  remoteName: {
    color: '#6b7280',
    fontSize: 12,
    marginLeft: 8,
  },
  headline: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  body: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  hashLabel: {
    color: '#4b5563',
    fontSize: 11,
    marginRight: 6,
  },
  hashValue: {
    color: '#6b7280',
    fontSize: 11,
  },
  mono: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

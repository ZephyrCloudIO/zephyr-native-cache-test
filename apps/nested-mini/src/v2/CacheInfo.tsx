import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

const SLEEP_DATA = {
  duration: '7h 45m',
  phases: [
    {label: 'Deep', hours: '2h 10m', pct: 28, color: '#6366f1'},
    {label: 'Light', hours: '3h 30m', pct: 45, color: '#818cf8'},
    {label: 'REM', hours: '1h 25m', pct: 18, color: '#a78bfa'},
    {label: 'Awake', hours: '40m', pct: 9, color: '#4b5563'},
  ],
  // Score is fetched from health API — null until loaded
  score: null as {value: number; label: string} | null,
};

export default function CacheInfo({
  testID = 'cache-info',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Sleep</Text>
        <Text testID="cache-info-version" style={styles.version}>{VERSION}</Text>
      </View>
      <View style={styles.durationRow}>
        <Text style={styles.duration}>{SLEEP_DATA.duration}</Text>
        <Text style={styles.quality}>{SLEEP_DATA.score.label}</Text>
      </View>
      <View style={styles.barRow}>
        {SLEEP_DATA.phases.map(p => (
          <View
            key={p.label}
            style={[styles.barSegment, {flex: p.pct, backgroundColor: p.color}]}
          />
        ))}
      </View>
      {SLEEP_DATA.phases.map(p => (
        <View key={p.label} style={styles.phaseRow}>
          <View style={[styles.phaseDot, {backgroundColor: p.color}]} />
          <Text style={styles.phaseLabel}>{p.label}</Text>
          <Text style={styles.phaseHours}>{p.hours}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f0f13',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: VERSION_COLOR,
    padding: 14,
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  version: {
    color: VERSION_COLOR,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 10,
  },
  duration: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  quality: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  barRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 10,
  },
  barSegment: {
    borderRadius: 2,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  phaseLabel: {
    color: '#a1a1aa',
    fontSize: 11,
    flex: 1,
  },
  phaseHours: {
    color: '#6b7280',
    fontSize: 11,
  },
});

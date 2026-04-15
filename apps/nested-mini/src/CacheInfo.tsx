import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

const SLEEP_PHASES = [
  {label: 'Deep', hours: '2h 10m', pct: 27, color: '#6366f1'},
  {label: 'Light', hours: '3h 45m', pct: 47, color: '#818cf8'},
  {label: 'REM', hours: '1h 30m', pct: 19, color: '#a78bfa'},
  {label: 'Awake', hours: '35m', pct: 7, color: '#4b5563'},
];

export default function CacheInfo({
  testID = 'cache-info',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>Sleep</Text>
      <View style={styles.durationRow}>
        <Text style={styles.duration}>8h 00m</Text>
        <Text style={styles.quality}>Good</Text>
      </View>
      <View style={styles.barRow}>
        {SLEEP_PHASES.map(p => (
          <View
            key={p.label}
            style={[styles.barSegment, {flex: p.pct, backgroundColor: p.color}]}
          />
        ))}
      </View>
      {SLEEP_PHASES.map(p => (
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
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

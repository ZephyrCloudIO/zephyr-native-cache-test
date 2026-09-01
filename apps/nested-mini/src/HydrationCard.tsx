import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v1';
const VERSION_COLOR = '#3b82f6'; // blue-500

const GLASSES = 6;
const GOAL = 8;

export default function HydrationCard({
  testID = 'hydration-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Hydration</Text>
        <Text testID="hydration-card-version" style={styles.version}>{VERSION}</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.value}>{GLASSES}</Text>
        <Text style={styles.unit}> / {GOAL} glasses</Text>
      </View>
      <View style={styles.glasses}>
        {Array.from({length: GOAL}).map((_, i) => (
          <View
            key={i}
            style={[styles.glass, i < GLASSES && styles.glassFilled]}
          />
        ))}
      </View>
      <Text style={styles.hint}>
        Fictional progress: {GOAL - GLASSES} remaining
      </Text>
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
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
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
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  value: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  unit: {
    color: '#6b7280',
    fontSize: 12,
  },
  glasses: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  glass: {
    flex: 1,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  glassFilled: {
    backgroundColor: '#38bdf8',
  },
  hint: {
    color: '#4b5563',
    fontSize: 10,
  },
});

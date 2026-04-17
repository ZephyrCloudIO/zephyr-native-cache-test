import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

const GLASSES = 6;
const GOAL = 8;

// Gradient: lighter for earlier glasses, deeper for later filled ones
const FILLED_COLORS = ['#bae6fd', '#93c5fd', '#7dd3fc', '#60a5fa', '#38bdf8', '#0ea5e9'];

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
      <View style={styles.drops}>
        {Array.from({length: GOAL}).map((_, i) => {
          const filled = i < GLASSES;
          const fillColor = filled ? FILLED_COLORS[Math.min(i, FILLED_COLORS.length - 1)] : undefined;
          return (
            <View
              key={i}
              style={[
                styles.drop,
                filled
                  ? {backgroundColor: fillColor}
                  : styles.dropEmpty,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.lastDrink}>Last drink: 2:30pm</Text>
      <Text style={styles.hint}>
        {GOAL - GLASSES} more to reach your daily goal
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
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
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
  drops: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  drop: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 28,
    borderRadius: 999,
  },
  dropEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  lastDrink: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    marginBottom: 4,
  },
  hint: {
    color: '#4b5563',
    fontSize: 10,
  },
});

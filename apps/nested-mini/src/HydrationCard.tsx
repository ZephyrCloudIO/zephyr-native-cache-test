import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

const GLASSES = 6;
const GOAL = 8;

export default function HydrationCard({
  testID = 'hydration-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>Hydration</Text>
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
        {GOAL - GLASSES} more to reach your daily goal
      </Text>
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

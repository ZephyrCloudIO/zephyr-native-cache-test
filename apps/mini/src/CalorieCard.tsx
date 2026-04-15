import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

const MEALS = [
  {label: 'Breakfast', cal: 420, color: '#f59e0b'},
  {label: 'Lunch', cal: 680, color: '#22c55e'},
  {label: 'Snacks', cal: 195, color: '#8b5cf6'},
];

const TOTAL = MEALS.reduce((s, m) => s + m.cal, 0);
const GOAL = 2200;

export default function CalorieCard({
  testID = 'calorie-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>Nutrition</Text>
      <View style={styles.header}>
        <Text style={styles.value}>{TOTAL}</Text>
        <Text style={styles.unit}> / {GOAL} cal</Text>
      </View>
      <View style={styles.bar}>
        {MEALS.map(m => (
          <View
            key={m.label}
            style={[
              styles.segment,
              {flex: m.cal, backgroundColor: m.color},
            ]}
          />
        ))}
        <View style={[styles.segment, {flex: GOAL - TOTAL, backgroundColor: 'rgba(255,255,255,0.04)'}]} />
      </View>
      {MEALS.map(m => (
        <View key={m.label} style={styles.row}>
          <View style={[styles.dot, {backgroundColor: m.color}]} />
          <Text style={styles.mealLabel}>{m.label}</Text>
          <Text style={styles.mealCal}>{m.cal} cal</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  value: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unit: {
    color: '#6b7280',
    fontSize: 12,
  },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 10,
  },
  segment: {
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  mealLabel: {
    color: '#a1a1aa',
    fontSize: 11,
    flex: 1,
  },
  mealCal: {
    color: '#6b7280',
    fontSize: 11,
  },
});

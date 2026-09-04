import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

const MEALS = [
  {label: 'Breakfast', cal: 420, color: '#f59e0b', time: '8:30am'},
  {label: 'Lunch', cal: 680, color: '#22c55e', time: '12:15pm'},
  {label: 'Snacks', cal: 195, color: '#8b5cf6', time: '3:45pm'},
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
      <View style={styles.labelRow}>
        <Text style={styles.label}>Sample Nutrition</Text>
        <Text testID="calorie-card-version" style={styles.version}>{VERSION}</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.value}>{TOTAL}</Text>
        <Text style={styles.unit}> / {GOAL} cal</Text>
      </View>

      <View style={styles.bar}>
        {MEALS.map(m => (
          <View
            key={m.label}
            style={[styles.segment, {flex: m.cal, backgroundColor: m.color}]}
          />
        ))}
        <View
          style={[
            styles.segment,
            {flex: GOAL - TOTAL, backgroundColor: 'rgba(255,255,255,0.04)'},
          ]}
        />
      </View>

      <View style={styles.macroRow}>
        <Text style={styles.macroP}>P 62g</Text>
        <Text style={styles.macroDot}> · </Text>
        <Text style={styles.macroC}>C 158g</Text>
        <Text style={styles.macroDot}> · </Text>
        <Text style={styles.macroF}>F 48g</Text>
      </View>

      {MEALS.map(m => (
        <View key={m.label} style={styles.row}>
          <View style={[styles.dot, {backgroundColor: m.color}]} />
          <Text style={styles.mealLabel}>{m.label}</Text>
          <Text style={styles.mealTime}>{m.time}</Text>
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
    height: 8,
    borderRadius: 10,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 8,
  },
  segment: {
    borderRadius: 10,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  macroP: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  macroC: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  macroF: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  macroDot: {
    color: '#4b5563',
    fontSize: 11,
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
  mealTime: {
    color: '#4b5563',
    fontSize: 10,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    marginRight: 8,
  },
  mealCal: {
    color: '#6b7280',
    fontSize: 11,
  },
});

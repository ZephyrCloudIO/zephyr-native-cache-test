import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

const WORKOUTS = [
  {type: 'Running', duration: '32 min', cal: '280 cal', icon: '🏃', intensity: 'High', intensityColor: '#ef4444'},
  {type: 'Cycling', duration: '45 min', cal: '410 cal', icon: '🚴', intensity: 'High', intensityColor: '#ef4444'},
  {type: 'Yoga', duration: '20 min', cal: '95 cal', icon: '🧘', intensity: 'Low', intensityColor: '#22c55e'},
  {type: 'Walking', duration: '18 min', cal: '85 cal', icon: '🚶', intensity: 'Med', intensityColor: '#f59e0b'},
];

export default function ActivityFeed({
  testID = 'activity-feed',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Sample Workouts</Text>
        <Text testID="activity-feed-version" style={styles.version}>{VERSION}</Text>
      </View>
      {WORKOUTS.map((w, i) => (
        <View
          key={i}
          style={[
            styles.row,
            i < WORKOUTS.length - 1 && styles.rowBorder,
          ]}>
          <Text style={styles.icon}>{w.icon}</Text>
          <View style={styles.rowContent}>
            <Text style={styles.type} numberOfLines={1} ellipsizeMode="tail">
              {w.type}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta} numberOfLines={1}>
                {w.duration}
              </Text>
              <View style={[styles.badge, {backgroundColor: `${w.intensityColor}22`}]}>
                <Text style={[styles.badgeText, {color: w.intensityColor}]}>
                  {w.intensity}
                </Text>
              </View>
              <Text style={styles.cal} numberOfLines={1}>{w.cal}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Total: 1h 55m · 870 cal</Text>
      </View>
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
    marginBottom: 8,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  icon: {
    fontSize: 16,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  type: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  meta: {
    color: '#6b7280',
    fontSize: 10,
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  cal: {
    color: '#a1a1aa',
    fontSize: 10,
  },
  footer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  footerText: {
    color: '#d4d4d8',
    fontSize: 11,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

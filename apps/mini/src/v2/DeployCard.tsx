import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

export default function DeployCard({
  testID = 'deploy-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Steps</Text>
        <Text testID="deploy-card-version" style={styles.version}>{VERSION}</Text>
      </View>

      <View style={styles.streakRow}>
        <Text style={styles.streakText}>🔥 12 day streak</Text>
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value}>8,432</Text>
        <Text style={styles.goal}>/ 10,000</Text>
      </View>

      <View style={styles.progressGroup}>
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>
        <Text style={styles.progressPct}>84%</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <View style={[styles.statDot, {backgroundColor: '#3b82f6'}]} />
          <Text style={styles.statValue}>3.4</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={[styles.statDot, {backgroundColor: '#f97316'}]} />
          <Text style={styles.statValue}>312</Text>
          <Text style={styles.statLabel}>cal</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <View style={[styles.statDot, {backgroundColor: '#22c55e'}]} />
          <Text style={styles.statValue}>47</Text>
          <Text style={styles.statLabel}>min</Text>
        </View>
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
  streakRow: {
    marginBottom: 8,
  },
  streakText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 10,
  },
  value: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  goal: {
    color: '#4b5563',
    fontSize: 13,
  },
  progressGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
  },
  progressFill: {
    width: '84%',
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 3,
  },
  progressPct: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'column',
    gap: 1,
  },
  statDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginBottom: 2,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statValue: {
    color: '#d4d4d8',
    fontSize: 14,
    fontWeight: '600',
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 1,
  },
});

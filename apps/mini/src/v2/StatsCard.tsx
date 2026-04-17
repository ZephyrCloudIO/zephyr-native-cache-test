import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';

export const VERSION = 'v2';
const VERSION_COLOR = '#22c55e'; // green-500

// Bar values — intensity determines color (green low, yellow mid, red high)
const BARS = [0.5, 0.6, 0.45, 0.7, 0.65, 0.8, 0.55, 0.6, 0.75, 0.5, 0.65, 0.7];

function barColor(v: number): string {
  if (v < 0.55) return '#22c55e';
  if (v < 0.68) return '#eab308';
  return '#ef4444';
}

export default function StatsCard({
  testID = 'stats-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Heart Rate</Text>
        <Text testID="stats-card-version" style={styles.version}>{VERSION}</Text>
      </View>

      <View style={styles.bpmRow}>
        <Text style={styles.bpm}>72</Text>
        <Text style={styles.unit}>bpm</Text>
      </View>

      <Text style={styles.minMax}>58 low · 112 high</Text>

      <View style={styles.zones}>
        <View style={styles.zone}>
          <View style={[styles.zoneDot, {backgroundColor: '#22c55e'}]} />
          <Text style={styles.zoneText}>Resting</Text>
        </View>
        <View style={styles.zone}>
          <View style={[styles.zoneDot, {backgroundColor: '#6b7280'}]} />
          <Text style={styles.zoneText}>62–85</Text>
        </View>
      </View>

      <View style={styles.chart}>
        {BARS.map((v, i) => (
          <View key={i} style={styles.chartBarTrack}>
            <View
              style={[
                styles.chartBar,
                {height: `${v * 100}%`, backgroundColor: barColor(v)},
              ]}
            />
          </View>
        ))}
      </View>

      <Text style={styles.avgLabel}>avg 68</Text>
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
  bpmRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  bpm: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  unit: {
    color: '#6b7280',
    fontSize: 13,
  },
  minMax: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    marginTop: 2,
    marginBottom: 8,
  },
  zones: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  zoneText: {
    color: '#6b7280',
    fontSize: 10,
  },
  chart: {
    flexDirection: 'row',
    height: 32,
    gap: 3,
    alignItems: 'flex-end',
  },
  chartBarTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 2,
  },
  avgLabel: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    marginTop: 4,
    textAlign: 'center',
  },
});

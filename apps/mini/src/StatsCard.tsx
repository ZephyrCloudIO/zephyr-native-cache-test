import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export default function StatsCard({
  testID = 'stats-card',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>Heart Rate</Text>
      <View style={styles.bpmRow}>
        <Text style={styles.bpm}>72</Text>
        <Text style={styles.unit}>bpm</Text>
      </View>
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
        {[0.5, 0.6, 0.45, 0.7, 0.65, 0.8, 0.55, 0.6, 0.75, 0.5, 0.65, 0.7].map(
          (v, i) => (
            <View key={i} style={styles.chartBarTrack}>
              <View style={[styles.chartBar, {height: `${v * 100}%`}]} />
            </View>
          ),
        )}
      </View>
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
  zones: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
    marginBottom: 12,
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
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
});

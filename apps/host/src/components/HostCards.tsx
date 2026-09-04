import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

function Goal({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = Math.min((current / target) * 100, 100);
  return (
    <View style={goalStyles.row}>
      <Text style={[goalStyles.label, {color}]}>{label}</Text>
      <View style={goalStyles.barTrack}>
        <View
          style={[
            goalStyles.barFill,
            {width: `${pct}%`, backgroundColor: color},
          ]}
        />
      </View>
      <Text style={goalStyles.value} numberOfLines={1}>
        {current}
        <Text style={goalStyles.unit}>/{target}</Text>
      </Text>
    </View>
  );
}

export function WeeklyGoals() {
  return (
    <View style={cardStyles.card} testID="host-info">
      <Text style={cardStyles.label}>Sample Weekly Goals</Text>
      <Goal label="Move" current={2840} target={3500} color="#ef4444" />
      <Goal label="Exercise" current={145} target={180} color="#22c55e" />
      <Goal label="Stand" current={9} target={12} color="#3b82f6" />
    </View>
  );
}

export function MoodCard() {
  return (
    <View style={cardStyles.card} testID="mood-card">
      <Text style={cardStyles.label}>Sample Mood</Text>
      <Text style={moodStyles.emoji}>😊</Text>
      <Text style={moodStyles.feeling}>Fictional mood example</Text>
      <View style={moodStyles.week}>
        {['😴', '😊', '😐', '😊', '😊', '🤩', '😊'].map((e, i) => (
          <Text key={i} style={moodStyles.day}>
            {e}
          </Text>
        ))}
      </View>
      <View style={moodStyles.dayLabels}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={moodStyles.dayLabel}>
            {d}
          </Text>
        ))}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
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
    marginBottom: 10,
  },
});

const goalStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    width: 46,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  value: {
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: '600',
    width: 72,
    textAlign: 'right',
  },
  unit: {
    color: '#6b7280',
    fontWeight: '400',
  },
});

const moodStyles = StyleSheet.create({
  emoji: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 4,
  },
  feeling: {
    color: '#a1a1aa',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    fontSize: 16,
    textAlign: 'center',
    flex: 1,
  },
  dayLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dayLabel: {
    color: '#4b5563',
    fontSize: 9,
    textAlign: 'center',
    flex: 1,
  },
});

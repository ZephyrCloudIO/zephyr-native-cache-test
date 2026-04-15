import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

const WORKOUTS = [
  {type: 'Running', duration: '32 min', cal: '280 cal', icon: '🏃'},
  {type: 'Cycling', duration: '45 min', cal: '410 cal', icon: '🚴'},
  {type: 'Yoga', duration: '20 min', cal: '95 cal', icon: '🧘'},
  {type: 'Walking', duration: '18 min', cal: '85 cal', icon: '🚶'},
];

export default function ActivityFeed({
  testID = 'activity-feed',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.label}>Today's Workouts</Text>
      {WORKOUTS.map((w, i) => (
        <View
          key={i}
          style={[
            styles.row,
            i < WORKOUTS.length - 1 && styles.rowBorder,
          ]}>
          <Text style={styles.icon}>{w.icon}</Text>
          <View style={styles.rowContent}>
            <Text style={styles.type}>{w.type}</Text>
            <Text style={styles.meta}>{w.duration}</Text>
          </View>
          <Text style={styles.cal}>{w.cal}</Text>
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
    marginBottom: 8,
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
  },
  type: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '500',
  },
  meta: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 1,
  },
  cal: {
    color: '#a1a1aa',
    fontSize: 11,
  },
});

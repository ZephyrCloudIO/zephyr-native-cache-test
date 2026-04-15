import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

// @ts-ignore
const PromoCard = React.lazy(() => import('mini/PromoCard'));

export default function Recommendations({
  testID = 'recommendations',
}: {
  testID?: string;
}) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.sectionLabel}>YOU MIGHT ALSO LIKE</Text>
      <React.Suspense
        fallback={
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#14b8a6" />
          </View>
        }>
        <PromoCard testID="nested-promo-card" />
      </React.Suspense>
      <Text style={styles.note}>Loaded via nested Module Federation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  sectionLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  loading: {
    backgroundColor: '#0f0f13',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  note: {
    color: '#4b5563',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
});

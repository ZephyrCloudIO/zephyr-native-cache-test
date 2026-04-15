import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';

export function Placeholder({height}: {height: number}) {
  return (
    <View style={[styles.container, {height}]}>
      <ActivityIndicator size="small" color="#a1a1aa" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f0f13',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

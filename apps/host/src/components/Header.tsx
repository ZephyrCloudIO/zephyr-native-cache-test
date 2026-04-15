import React from 'react';
import {Image, Platform, StyleSheet, Text, View} from 'react-native';

const logo = require('../assets/zephyr-logo.png');

interface HeaderProps {}

export function Header(_props: HeaderProps) {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.container}>
      <Image source={logo} style={styles.bgLogo} resizeMode="contain" />
      <View style={styles.content}>
        <Text style={styles.title}>
          Zephyr <Text style={styles.titleAccent}>Health</Text>
        </Text>
        <Text style={styles.greeting}>
          {greeting} — <Text style={styles.date}>{dateStr}</Text>
        </Text>
      </View>
      <View style={styles.accentLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#09090b',
    overflow: 'hidden',
  },
  bgLogo: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 140,
    height: 140,
    opacity: 0.07,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  titleAccent: {
    color: '#8b5cf6',
  },
  greeting: {
    color: '#4b5563',
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  date: {
    color: '#6b7280',
  },
  accentLine: {
    height: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
});

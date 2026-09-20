import React from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const logo = require('../assets/zephyr-logo.png');
const ZEPHYR_WEBSITE_URL = 'https://zephyr-cloud.io';

interface HeaderProps {}

export function Header(_props: HeaderProps) {
  const now = new Date();
  let dateStr = 'Today';
  try {
    dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  } catch {}

  return (
    <View style={styles.container}>
      <Image
        source={logo}
        style={styles.bgLogo}
        resizeMode="contain"
        accessible={false}
      />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            Zephyr <Text style={styles.titleAccent}>Health</Text>
          </Text>
          <Pressable
            accessibilityLabel="Get started with Zephyr"
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => {
              Linking.openURL(ZEPHYR_WEBSITE_URL).catch(error => {
                if (__DEV__) console.warn('[link] Unable to open Zephyr website', error);
              });
            }}
            style={styles.websiteLink}
            testID="zephyr-website-link">
            <Text style={styles.websiteLinkText}>Get started</Text>
          </Pressable>
        </View>
        <Text style={styles.greeting}>
          Demo dashboard - <Text style={styles.date}>{dateStr}</Text>
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
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  websiteLink: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  websiteLinkText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
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

import ZephyrNativeCache from 'zephyr-native-cache';
import {withAsyncStartup} from '@module-federation/metro/bootstrap';
import React from 'react';
import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';
import {ErrorBoundary} from './src/components/ErrorBoundary';
import Fallback from './src/Fallback';

const pollIntervalMs = process.env.ZEPHYR_E2E === '1' ? 15_000 : 300_000;
ZephyrNativeCache.register({forceCacheInDev: true, pollIntervalMs});

const AsyncApp = withAsyncStartup(
  () => require('./src/App'),
  () => require('./src/Fallback'),
)();

function Root() {
  return React.createElement(
    ErrorBoundary,
    {
      name: 'Application',
      onRetry: () => ZephyrNativeCache.reloadApp(),
      fallback: React.createElement(Fallback, {failed: true}),
    },
    React.createElement(AsyncApp),
  );
}

AppRegistry.registerComponent(appName, () => Root);

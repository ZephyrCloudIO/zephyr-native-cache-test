import {register} from 'zephyr-native-cache';
import {withAsyncStartup} from '@module-federation/metro/bootstrap';
import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';

// Enable native cache layer in dev mode for debugging
register({forceCacheInDev: true});

AppRegistry.registerComponent(
  appName,
  withAsyncStartup(
    () => require('./src/App'),
    () => require('./src/Fallback'),
  ),
);

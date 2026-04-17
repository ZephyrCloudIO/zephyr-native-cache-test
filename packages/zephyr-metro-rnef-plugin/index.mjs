// RNEF plugin that bundles MF remotes & hosts through zephyrCommandWrapper,
// causing each `rnef bundle-mf-remote` / `bundle-mf-host` to upload artifacts
// to Zephyr after the Metro build completes.
//
// Source mirrored from zephyr-examples/frameworks/react-native-metro/
// packages/plugin-rnef-zephyr/src/plugin.ts — stripped of TS types. Kept as a
// separate workspace package so it can eventually be moved upstream to
// zephyr-packages without a rename.

import { updateManifest } from '@module-federation/metro';
import commands from '@module-federation/metro/commands';
import { color, logger, outro } from '@rnef/tools';
import { zephyrCommandWrapper as createZephyrCommand } from 'zephyr-metro-plugin';

export const zephyrMetroRNEFPlugin =
  (pluginConfig = {}) =>
  (api) => {
    api.registerCommand({
      name: 'bundle-mf-host',
      description: 'Bundles a Module Federation host with Zephyr Cloud',
      action: async (args) => {
        const commandConfig = {
          root: api.getProjectRoot(),
          platforms: api.getPlatforms(),
          reactNativePath: api.getReactNativePath(),
          ...pluginConfig,
        };

        logger.info(
          `Bundling Module Federation host for platform ${color.cyan(
            args.platform,
          )} with Zephyr Cloud`,
        );

        const bundleZephyrHostCommand = await createZephyrCommand(
          commands.bundleFederatedHost,
          commands.loadMetroConfig,
          () => {
            updateManifest(
              global.__METRO_FEDERATION_MANIFEST_PATH,
              global.__METRO_FEDERATION_CONFIG,
            );
          },
        );

        await bundleZephyrHostCommand([{ ...args }], commandConfig, args);
        logger.info('Bundle artifacts uploaded to Zephyr.');
        outro('Success.');
      },
      options: commands.bundleFederatedHostOptions,
    });

    api.registerCommand({
      name: 'bundle-mf-remote',
      description: 'Bundles a Module Federation remote with Zephyr Cloud',
      action: async (args) => {
        const commandConfig = {
          root: api.getProjectRoot(),
          platforms: api.getPlatforms(),
          reactNativePath: api.getReactNativePath(),
          ...pluginConfig,
        };

        logger.info(
          `Bundling Module Federation remote for platform ${color.cyan(
            args.platform,
          )} with Zephyr Cloud`,
        );

        const bundleZephyrRemoteCommand = await createZephyrCommand(
          commands.bundleFederatedRemote,
          commands.loadMetroConfig,
          () => {
            updateManifest(
              global.__METRO_FEDERATION_MANIFEST_PATH,
              global.__METRO_FEDERATION_CONFIG,
            );
          },
        );

        await bundleZephyrRemoteCommand([{ ...args }], commandConfig, args);
        logger.info('Bundle artifacts uploaded to Zephyr.');
        outro('Success.');
      },
      options: commands.bundleFederatedRemoteOptions,
    });

    return {
      name: 'zephyr-metro-rnef-plugin',
      description: 'RNEF plugin for Module Federation with Metro + Zephyr',
    };
  };

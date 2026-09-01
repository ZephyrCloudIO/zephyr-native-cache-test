import type {ModuleFederationRuntimePlugin} from '@module-federation/runtime';

export default function (): ModuleFederationRuntimePlugin {
  return {
    name: 'custom-plugin-build',
    beforeLoadShare(args) {
      if (__DEV__) console.log('[build time inject] beforeLoadShare', args.pkgName);
      return args;
    },
  };
}

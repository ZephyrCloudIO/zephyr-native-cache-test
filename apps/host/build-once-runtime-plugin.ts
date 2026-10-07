import type {ModuleFederationRuntimePlugin} from '@module-federation/runtime';
import {getNativeMFECache} from '@zephyr-demo/host-capabilities/native';
import {getBuildOnceInfo} from './src/lib/buildOnceInfo';
import {recordDemoManifest} from './src/lib/buildOnceDiagnostics';
import {createDemoManifestCache, inspectDemoManifest} from './src/lib/demoManifestCache';

export default function buildOnceRuntimePlugin(): ModuleFederationRuntimePlugin {
  const {runId} = getBuildOnceInfo();
  const native = getNativeMFECache();
  const cache = createDemoManifestCache({runId, native});
  return {
    name: 'build-once-demo-manifest-cache',
    fetch(url, _requestInit, remoteInfo) {
      const alias = remoteInfo?.alias ?? remoteInfo?.name;
      if (alias !== 'mini' && alias !== 'nestedMini') return undefined;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return undefined;
      }
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.pathname.endsWith('/mf-manifest.json')) return undefined;
      return cache.get(url, alias).then(async ({body, source}) => {
        const {executableHashes, executableArtifactSetId} = await inspectDemoManifest(body, alias, value => native.sha256String(value));
        recordDemoManifest({remoteName: alias, manifestUrl: url, source, executableHashes, executableArtifactSetId});
        return new Response(body, {status: 200, headers: {'content-type': 'application/json'}});
      });
    },
  };
}

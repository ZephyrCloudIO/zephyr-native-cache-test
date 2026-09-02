function fail(message) {
  throw new Error(message);
}

function artifactBase(manifest, manifestUrl) {
  const publicPath = manifest.metaData?.publicPath;
  return publicPath && publicPath !== 'auto' && /^https?:\/\//.test(publicPath)
    ? publicPath
    : manifestUrl.replace(/\/[^/]*$/, '');
}

function bundleAssetPath(path) {
  return path.replace(/\.\w+$/, '.bundle');
}

function artifactUrl(base, path, modulesOnly) {
  const bareUrl = `${base.replace(/\/+$/, '')}/${path.replace(/^\.?\//, '')}`;
  if (!modulesOnly || bareUrl.includes('modulesOnly=') || bareUrl.includes('runModule=')) {
    return bareUrl;
  }
  return `${bareUrl}?modulesOnly=true&runModule=false`;
}

export function manifestArtifactMap(manifest, manifestUrl) {
  const base = artifactBase(manifest, manifestUrl);
  const result = {};
  const add = (path, hash, modulesOnly = false) => {
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      fail(`Manifest artifact has no valid SHA-256: ${path}`);
    }
    result[artifactUrl(base, path, modulesOnly)] = hash;
  };

  const remoteEntry = manifest.metaData?.remoteEntry;
  const buildHash = manifest.metaData?.buildInfo?.hash;
  if (!remoteEntry?.name || !buildHash) fail('Manifest remote entry/build hash is missing');
  const remoteEntryPath = [
    remoteEntry.path?.replace(/^\/+|\/+$/g, ''),
    remoteEntry.name,
  ]
    .filter(Boolean)
    .join('/');
  add(remoteEntryPath, buildHash);

  for (const expose of manifest.exposes ?? []) {
    const asyncAssets = expose.assets?.js?.async ?? [];
    if (asyncAssets.length > 0) {
      fail(`Exposed module ${expose.name} has unverifiable async executable assets`);
    }
    add(`exposed/${expose.name}.bundle`, expose.hash, true);
  }

  for (const shared of manifest.shared ?? []) {
    const asyncAssets = shared.assets?.js?.async ?? [];
    if (asyncAssets.length > 0) {
      fail(`Shared module ${shared.name} has unverifiable async executable assets`);
    }
    const assets = [
      ...(shared.assets?.js?.sync ?? []),
    ];
    if (assets.length === 0) continue;
    if (!shared.hash || assets.length !== 1) {
      fail(`Shared module ${shared.name} is not represented by one verifiable artifact`);
    }
    add(bundleAssetPath(assets[0]), shared.hash, true);
  }
  return {artifacts: result, buildHash};
}

export function logicalArtifactMap(artifacts) {
  return Object.fromEntries(
    Object.entries(artifacts)
      .map(([url, hash]) => {
        const parsed = new URL(url);
        return [`${parsed.pathname}${parsed.search}`, hash];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

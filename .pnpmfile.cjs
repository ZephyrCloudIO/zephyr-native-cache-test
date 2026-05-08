/**
 * Strip integrity hashes for local file: tarball dependencies so pnpm always
 * re-resolves them when optional R&D tarballs are rebuilt from vendor/mf-core.
 */
function afterAllResolved(lockfile, context) {
  const packages = lockfile.packages ?? {};
  for (const [key, pkg] of Object.entries(packages)) {
    if (
      pkg.resolution &&
      typeof pkg.resolution.tarball === 'string' &&
      pkg.resolution.tarball.startsWith('file:tarballs/')
    ) {
      delete pkg.resolution.integrity;
      context.log(`stripped integrity for ${key}`);
    }
  }
  return lockfile;
}

module.exports = {
  hooks: {
    afterAllResolved,
  },
};

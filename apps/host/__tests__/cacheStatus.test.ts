import {findEntry} from '../src/lib/cacheStatus';

const entry = (remoteName: string) =>
  ({remoteName, bundleUrl: `https://example.test/${remoteName}.bundle`}) as any;

describe('findEntry', () => {
  it('prefers an exact cache key', () => {
    const exact = entry('different-name');
    expect(findEntry({StatsCard: exact}, 'StatsCard')).toBe(exact);
  });

  it('finds an exposed module by its remote-name suffix', () => {
    const exposed = entry('exposed/StatsCard');
    expect(findEntry({unrelatedKey: exposed}, 'StatsCard')).toBe(exposed);
  });

  it('returns undefined when the module has not loaded', () => {
    expect(findEntry({}, 'StatsCard')).toBeUndefined();
  });
});

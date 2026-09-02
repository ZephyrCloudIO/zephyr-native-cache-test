import {loadRemote} from '../src/lib/loadRemote';

describe('loadRemote', () => {
  afterEach(() => jest.useRealTimers());

  it('returns a resolved remote module', async () => {
    await expect(loadRemote('Card', async () => ({default: 'card'}))).resolves.toEqual({
      default: 'card',
    });
  });

  it('preserves a remote rejection', async () => {
    await expect(
      loadRemote('Card', async () => {
        throw new Error('download failed');
      }),
    ).rejects.toThrow('download failed');
  });

  it('rejects a remote that never settles', async () => {
    jest.useFakeTimers();
    const result = loadRemote('Card', () => new Promise(() => {}), 1_000).catch(
      error => error,
    );
    jest.advanceTimersByTime(1_000);
    expect(await result).toEqual(new Error('Card did not load in time'));
  });
});

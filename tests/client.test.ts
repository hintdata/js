import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HintData, HintDataError } from '../src/core/client';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) };
};

describe('запрос', () => {
  it('бьёт в нативный маршрут /v1/suggest/{сервис} с ключом в заголовке', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [{ value: 'Москва' }] }));
    const items = await new HintData('pk_test').suggest('address', 'мос');

    const { url, init, body } = lastCall();
    expect(url).toBe('https://api.hintdata.ru/v1/suggest/address');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Token pk_test');
    expect(body).toEqual({ query: 'мос' });
    expect(items).toEqual([{ value: 'Москва' }]);
  });

  it('findById идёт в /v1/find — маршрута /v1/findById у шлюза нет', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    await new HintData('sk_test').findById('address', 'fias-id');
    expect(lastCall().url).toBe('https://api.hintdata.ru/v1/find/address');
  });

  it('база без хвостового слэша', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    await new HintData('k', { url: 'https://proxy.example.com/' }).suggest('fio', 'ив');
    expect(lastCall().url).toBe('https://proxy.example.com/v1/suggest/fio');
  });

  it('адресные опции уходят в snake_case, для других сервисов не добавляются', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    const hd = new HintData('k');
    await hd.suggest('address', 'мяс', { count: 3, fromBound: 'street', locations: [{ city: 'Москва' }] });
    expect(lastCall().body).toEqual({
      query: 'мяс',
      count: 3,
      from_bound: { value: 'street' },
      locations: [{ city: 'Москва' }],
    });

    await hd.suggest('bank', 'сбер', { count: 3, fromBound: 'street' });
    expect(lastCall().body).toEqual({ query: 'сбер', count: 3 });
  });

  it('пустой запрос не ходит в сеть', async () => {
    expect(await new HintData('k').suggest('address', '   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('geolocate передаёт радиус', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    await new HintData('k').geolocate(55.75, 37.61, { radiusMeters: 200 });
    expect(lastCall().body).toEqual({ lat: 55.75, lon: 37.61, count: 5, radius_meters: 200 });
  });
});

describe('ошибки', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [400, 'bad_response'],
  ])('HTTP %i → code %s', async (status, code) => {
    fetchMock.mockResolvedValue(fail(status));
    const err = await new HintData('k').suggest('address', 'мос').catch((e: unknown) => e as HintDataError);

    expect(err).toBeInstanceOf(HintDataError);
    expect(err).toMatchObject({ status, code });
  });

  it('сетевой сбой не выдаётся за пустой результат', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'));
    await expect(new HintData('k').suggest('address', 'мос')).rejects.toMatchObject({
      status: 0,
      code: 'network',
    });
  });

  it('отмена по signal', async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementation(
      () => new Promise((_, reject) => ctrl.signal.addEventListener('abort', () => reject(abortError()))),
    );
    const p = new HintData('k').suggest('address', 'мос', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });

  it('таймаут отменяет запрос сам', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(abortError()))),
    );
    await expect(new HintData('k', { timeout: 5 }).suggest('address', 'мос')).rejects.toMatchObject({
      code: 'aborted',
    });
  });
});

describe('кэш', () => {
  it('повторный запрос не ходит в сеть', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [{ value: 'Москва' }] }));
    const hd = new HintData('k');
    await hd.suggest('address', 'мос');
    await hd.suggest('address', 'мос');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('разные опции — разные ключи кэша', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    const hd = new HintData('k');
    await hd.suggest('address', 'мос', { count: 1 });
    await hd.suggest('address', 'мос', { count: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('noCache отключает', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }));
    const hd = new HintData('k', { noCache: true });
    await hd.suggest('address', 'мос');
    await hd.suggest('address', 'мос');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('geoBoost', () => {
  it('один iplocate на все обращения', async () => {
    fetchMock.mockResolvedValue(ok({ location: { components: { city: { kladr_id: 'CITY' } } } }));
    const hd = new HintData('k-unique-' + Math.random());
    const [a, b] = await Promise.all([hd.geoBoost(), hd.geoBoost()]);

    expect(a).toEqual({ kladr_id: 'CITY' });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('сбой гео не роняет вызывающего', async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(new HintData('k-fail-' + Math.random()).geoBoost()).resolves.toBeNull();
  });
});

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError');
}

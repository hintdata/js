import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachHints, type HintsInstance } from '../src/widget/create';
import { HintData } from '../src/core/client';

const ITEMS = [
  { value: 'г Москва, ул Мясницкая, д 13', address: { city: 'Москва', street: 'Мясницкая', house: '13' } },
];

let input: HTMLInputElement;
let hints: HintsInstance | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

const reply = (items: unknown[] = ITEMS) =>
  ({ ok: true, status: 200, json: async () => ({ suggestions: items }) }) as Response;

async function type(text: string, wait = 150): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(wait);
  await Promise.resolve();
  await Promise.resolve();
}

const items = (): HTMLElement[] => Array.from(document.querySelectorAll('.hd-item'));
const panel = (): HTMLElement | null => document.querySelector('.hd-panel');
const visible = (): boolean => Boolean(panel()) && panel()?.style.display !== 'none';
const bodyOf = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body));

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue(reply());
  vi.stubGlobal('fetch', fetchMock);
  input = document.createElement('input');
  document.body.appendChild(input);
});

afterEach(() => {
  hints?.destroy();
  hints = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('onError — сбой перестаёт выглядеть как «ничего не нашлось»', () => {
  it.each([
    [401, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'server_error'],
  ])('HTTP %i доходит до интегратора как %s', async (status, code) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) } as Response);
    const onError = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, onError });
    await type('мясницкая');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ status, code });
    expect(visible()).toBe(false);
  });

  it('пустая, но успешная выдача ошибкой не считается', async () => {
    fetchMock.mockResolvedValue(reply([]));
    const onError = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, onError });
    await type('неттакого');
    expect(onError).not.toHaveBeenCalled();
  });

  it('отменённый гонкой запрос ошибкой не считается', async () => {
    const onError = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, onError, delay: 0 });
    await type('мяс', 0);
    await type('мясн', 0);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('setOptions — связанные поля', () => {
  it('меняет территорию без пересоздания виджета', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('ленина');
    expect(bodyOf(0).locations).toBeUndefined();

    hints.setOptions({ locations: 'Москва' });
    fetchMock.mockClear();
    await type('ленина 1');
    expect(bodyOf(0).locations).toEqual([{ region: 'Москва' }]);
  });

  it('объект-ограничение уходит как есть — связанные поля якорятся по fias', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    hints.setOptions({ locations: { city_fias_id: 'CITY-FIAS' } });
    await type('ленина');
    expect(bodyOf(0).locations).toEqual([{ city_fias_id: 'CITY-FIAS' }]);
  });

  it('массив ограничений передаётся целиком', async () => {
    hints = attachHints(input, {
      key: 'pk',
      geo: false,
      locations: [{ region: 'Москва' }, { region: 'Московская' }],
    });
    await type('ленина');
    expect(bodyOf(0).locations).toEqual([{ region: 'Москва' }, { region: 'Московская' }]);
  });

  it('меняет сервис', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    hints.setOptions({ service: 'bank' });
    await type('сбер');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/suggest/bank');
  });

  it('патч не сбрасывает опции, заданные при создании', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, count: 3 });
    hints.setOptions({ locations: 'Москва' });
    await type('ленина');
    expect(bodyOf(0).count).toBe(3);
  });

  it('новая пауза применяется к следующему вводу', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, delay: 100 });
    hints.setOptions({ delay: 1000 });
    await type('мяс', 200);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('закрывает список — прежняя выдача уже не про то', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    expect(visible()).toBe(true);

    hints.setOptions({ locations: 'Москва' });
    expect(visible()).toBe(false);
  });
});

describe('clear / disable / enable', () => {
  it('clear очищает поле и список', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    hints.clear();

    expect(input.value).toBe('');
    expect(visible()).toBe(false);
  });

  it('disable останавливает запросы, enable возвращает', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    hints.disable();
    await type('мясницкая');
    expect(fetchMock).not.toHaveBeenCalled();

    hints.enable();
    await type('мясницкая 13');
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('onSelectNothing — подтверждён объект или набран руками', () => {
  it('ушли из поля с ручным вводом', async () => {
    const onSelectNothing = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, onSelectNothing });
    await type('моя дача у реки');
    input.dispatchEvent(new Event('blur'));

    expect(onSelectNothing).toHaveBeenCalledWith('моя дача у реки');
  });

  it('после выбора из подсказок не срабатывает', async () => {
    const onSelectNothing = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house', onSelectNothing });
    await type('мясницкая');
    pick(items()[0]);
    input.dispatchEvent(new Event('blur'));

    expect(onSelectNothing).not.toHaveBeenCalled();
  });

  it('правка после выбора снова делает значение неподтверждённым', async () => {
    const onSelectNothing = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house', onSelectNothing });
    await type('мясницкая');
    pick(items()[0]);

    input.value = ITEMS[0].value + ' кв 5';
    input.dispatchEvent(new Event('blur'));
    expect(onSelectNothing).toHaveBeenCalledWith(ITEMS[0].value + ' кв 5');
  });

  it('пустое поле не считается неподтверждённым', async () => {
    const onSelectNothing = vi.fn();
    hints = attachHints(input, { key: 'pk', geo: false, onSelectNothing });
    input.dispatchEvent(new Event('blur'));
    expect(onSelectNothing).not.toHaveBeenCalled();
  });
});

describe('formatSelected', () => {
  it('подставляет свою строку, а в колбэк отдаёт всю подсказку', async () => {
    const onSelect = vi.fn();
    hints = attachHints(input, {
      key: 'pk',
      geo: false,
      to: 'house',
      onSelect,
      formatSelected: (s) => String(s.address?.street ?? ''),
    });
    await type('мясницкая');
    pick(items()[0]);

    expect(input.value).toBe('Мясницкая');
    expect(onSelect.mock.calls[0][0].value).toBe(ITEMS[0].value);
  });
});

describe('общий клиент на форму', () => {
  it('два поля с одним клиентом не платят за один запрос дважды', async () => {
    const client = new HintData('pk');
    const second = document.createElement('input');
    document.body.appendChild(second);

    const a = attachHints(input, { client, geo: false });
    const b = attachHints(second, { client, geo: false });

    await type('мясницкая');
    second.value = 'мясницкая';
    second.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    a.destroy();
    b.destroy();
  });
});

/** Выбор пункта: шлём то же событие, что слушает виджет (pointerdown там, где он есть). */
function pick(el: HTMLElement): void {
  const type = 'onpointerdown' in el ? 'pointerdown' : 'mousedown';
  el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

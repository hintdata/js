import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachHints } from '../src/widget/create';
import type { HintsInstance } from '../src/widget/create';

const SUGGESTIONS = [
  { value: 'г Москва, ул Мясницкая, д 13', address: { city: 'Москва', street: 'Мясницкая', house: '13' } },
  { value: 'г Москва, ул Мясницкая, д 15', address: { city: 'Москва', street: 'Мясницкая', house: '15' } },
];

let input: HTMLInputElement;
let hints: HintsInstance | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

const reply = (items: unknown[] = SUGGESTIONS) =>
  ({ ok: true, status: 200, json: async () => ({ suggestions: items }) }) as Response;

/** Ввести текст и дождаться отрисовки: debounce + промисы запроса. */
async function type(text: string): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(150);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

const panel = (): HTMLElement | null => document.querySelector('.hd-panel');
const items = (): HTMLElement[] => Array.from(document.querySelectorAll('.hd-item'));
const visible = (): boolean => Boolean(panel()) && panel()?.style.display !== 'none';

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

describe('жизненный цикл', () => {
  it('отключает автодополнение браузера, чтобы оно не перекрывало список', () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('destroy убирает панель и снимает обработчики', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    expect(visible()).toBe(true);

    hints.destroy();
    expect(panel()).toBeNull();

    fetchMock.mockClear();
    input.value = 'ещё';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запрос в полёте не воскрешает панель после destroy', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    input.value = 'мясницкая';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(150);

    hints.destroy();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    expect(panel()).toBeNull();
  });
});

describe('выдача подсказок', () => {
  it('рисует пункты и подсвечивает совпадение', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');

    expect(items()).toHaveLength(2);
    expect(items()[0].querySelector('.hd-hl')?.textContent?.toLowerCase()).toBe('мясницкая');
  });

  it('короткий ввод не запрашивает', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, minChars: 5 });
    input.value = 'мяс';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('пустой результат без emptyText просто не открывает список', async () => {
    fetchMock.mockResolvedValue(reply([]));
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('неттакого');
    expect(visible()).toBe(false);
  });

  it('с emptyText показывает состояние «ничего не найдено»', async () => {
    fetchMock.mockResolvedValue(reply([]));
    hints = attachHints(input, { key: 'pk', geo: false, emptyText: 'Ничего не найдено' });
    await type('неттакого');
    expect(document.querySelector('.hd-empty')?.textContent).toBe('Ничего не найдено');
  });

  it('сбой API гасится — список не открывается', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    expect(visible()).toBe(false);
  });

  it('неизвестный сервис клампится в address с предупреждением', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hints = attachHints(input, { key: 'pk', geo: false, service: 'нетакого' });
    await type('мос');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/suggest/address');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('party — поддержанный сервис: организации ищутся виджетом', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, service: 'party' });
    await type('яндекс');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/suggest/party');
  });

  it('car_model — поддержанный сервис, запрос уходит как есть', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, service: 'car_model' });
    await type('camry');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/suggest/car_model');
  });

  it('экранирует разметку в значении подсказки', async () => {
    fetchMock.mockResolvedValue(reply([{ value: '<img src=x onerror=alert(1)>' }]));
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('злой');

    expect(panel()?.querySelector('img')).toBeNull();
    expect(items()[0].textContent).toContain('<img');
  });
});

describe('выбор подсказки', () => {
  it('подставляет значение и уведомляет фреймворк событием input', async () => {
    const onSelect = vi.fn();
    const events: string[] = [];
    hints = attachHints(input, { key: 'pk', geo: false, onSelect });
    for (const type of ['input', 'change', 'hintdata:select']) {
      input.addEventListener(type, () => events.push(type));
    }
    await type('мясницкая');
    events.length = 0; // выкидываем событие имитированного ввода — нас интересует только выбор
    pick(items()[0]);

    expect(input.value).toBe(SUGGESTIONS[0].value);
    expect(events).toEqual(['hintdata:select', 'input', 'change']);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: SUGGESTIONS[0].value }));
  });

  it('свой input не запускает новый поиск', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house' });
    await type('мясницкая');
    fetchMock.mockClear();

    pick(items()[0]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hintdata:select несёт саму подсказку', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house' });
    const detail = vi.fn();
    input.addEventListener('hintdata:select', (e) => detail((e as CustomEvent).detail));
    await type('мясницкая');
    pick(items()[1]);

    expect(detail).toHaveBeenCalledWith({
      value: SUGGESTIONS[1].value,
      suggestion: expect.objectContaining({ value: SUGGESTIONS[1].value }),
    });
  });
});

describe('клавиатура', () => {
  const key = (k: string): void => input.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

  it('стрелки перебирают пункты по кругу', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');

    key('ArrowDown');
    expect(items()[0].classList.contains('hd-active')).toBe(true);
    key('ArrowDown');
    expect(items()[1].classList.contains('hd-active')).toBe(true);
    key('ArrowDown');
    expect(items()[0].classList.contains('hd-active')).toBe(true);
    key('ArrowUp');
    expect(items()[1].classList.contains('hd-active')).toBe(true);
  });

  it('Enter выбирает активный пункт', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house' });
    await type('мясницкая');
    key('ArrowDown');
    key('Enter');
    expect(input.value).toBe(SUGGESTIONS[0].value);
  });

  it('Enter без активного пункта ничего не подставляет', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    key('Enter');
    expect(input.value).toBe('мясницкая');
  });

  it('Escape закрывает список', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await type('мясницкая');
    key('Escape');
    expect(visible()).toBe(false);
  });

  it('Escape закрывает и пустое состояние', async () => {
    fetchMock.mockResolvedValue(reply([]));
    hints = attachHints(input, { key: 'pk', geo: false, emptyText: 'Ничего' });
    await type('неттакого');
    expect(visible()).toBe(true);

    key('Escape');
    expect(visible()).toBe(false);
  });
});

describe('углубление по уровням', () => {
  it('после выбора дома запрашивает квартиры с якорем', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    fetchMock.mockResolvedValue(
      reply([
        {
          value: 'г Москва, ул Мясницкая, д 13',
          address: { city: 'Москва', street: 'Мясницкая', house: '13' },
          components: { house: { fias_id: 'HOUSE-FIAS' } },
        },
      ]),
    );
    await type('мясницкая 13');
    fetchMock.mockClear();

    pick(items()[0]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      from_bound: { value: 'flat' },
      locations: [{ house_fias_id: 'HOUSE-FIAS' }],
    });
  });

  it('фиксированный уровень to выключает углубление', async () => {
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house' });
    await type('мясницкая');
    fetchMock.mockClear();

    pick(items()[0]);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** Выбор пункта: шлём то же событие, что слушает виджет (pointerdown там, где он есть). */
function pick(el: HTMLElement): void {
  const type = 'onpointerdown' in el ? 'pointerdown' : 'mousedown';
  el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

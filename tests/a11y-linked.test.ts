import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachHints, type HintsInstance } from '../src/widget/create';

const CITY = {
  value: 'г Тверь',
  address: { region: 'Тверская', city: 'Тверь' },
  components: { city: { fias_id: 'CITY-FIAS' }, region: { fias_id: 'REG-FIAS' } },
};
const TWO = [
  { value: 'ул Мясницкая, д 13', address: { street: 'Мясницкая', house: '13' } },
  { value: 'ул Мясницкая, д 15', address: { street: 'Мясницкая', house: '15' } },
];

let input: HTMLInputElement;
let hints: HintsInstance | undefined;
let extra: HintsInstance | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

const reply = (items: unknown[]) =>
  ({ ok: true, status: 200, json: async () => ({ suggestions: items }) }) as Response;

const el = (): HTMLInputElement => {
  const i = document.createElement('input');
  document.body.appendChild(i);
  return i;
};

async function typeIn(target: HTMLInputElement, text: string): Promise<void> {
  target.value = text;
  target.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(150);
  await Promise.resolve();
  await Promise.resolve();
}

function pick(item: HTMLElement): void {
  const type = 'onpointerdown' in item ? 'pointerdown' : 'mousedown';
  item.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

const items = (): HTMLElement[] => Array.from(document.querySelectorAll('.hd-item'));
const key = (target: HTMLInputElement, k: string): void =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue(reply(TWO));
  vi.stubGlobal('fetch', fetchMock);
  input = el();
});

afterEach(() => {
  hints?.destroy();
  extra?.destroy();
  hints = extra = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('доступность: паттерн combobox', () => {
  it('поле объявляет себя списком ещё до первого запроса', () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-controls')).toBeTruthy();
  });

  it('открытие списка объявляется, закрытие — тоже', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await typeIn(input, 'мясницкая');
    expect(input.getAttribute('aria-expanded')).toBe('true');

    key(input, 'Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('панель — listbox, пункты — option и не ловят Tab', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await typeIn(input, 'мясницкая');

    const panel = document.querySelector('.hd-panel');
    expect(panel?.getAttribute('role')).toBe('listbox');
    expect(input.getAttribute('aria-controls')).toBe(panel?.id);
    for (const it of items()) {
      expect(it.getAttribute('role')).toBe('option');
      expect(it.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('стрелки двигают указатель на активный пункт', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    await typeIn(input, 'мясницкая');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(items()[0].id);
    expect(items()[0].getAttribute('aria-selected')).toBe('true');
    expect(items()[1].getAttribute('aria-selected')).toBe('false');

    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(items()[1].id);
  });

  it('у двух виджетов на странице идентификаторы не пересекаются', async () => {
    const second = el();
    hints = attachHints(input, { key: 'pk', geo: false });
    extra = attachHints(second, { key: 'pk', geo: false });
    expect(input.getAttribute('aria-controls')).not.toBe(second.getAttribute('aria-controls'));
  });
});

describe('связанные поля через parent', () => {
  const setup = (): { city: HTMLInputElement; street: HTMLInputElement } => {
    const city = el();
    const street = el();
    hints = attachHints(city, { key: 'pk', geo: false, to: 'city' });
    extra = attachHints(street, { key: 'pk', geo: false, parent: city });
    return { city, street };
  };

  it('дочернее поле выключено, пока родитель не выбран', async () => {
    const { street } = setup();
    await typeIn(street, 'мясницкая');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('после выбора родителя якорится на его fias и уходит на уровень детей', async () => {
    const { city, street } = setup();
    fetchMock.mockResolvedValue(reply([CITY]));
    await typeIn(city, 'тверь');
    pick(items()[0]);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply(TWO));
    await typeIn(street, 'мясницкая');

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.locations).toEqual([{ city_fias_id: 'CITY-FIAS' }]);
    expect(body.from_bound).toEqual({ value: 'street' });
  });

  it('правка родителя сбрасывает и выключает дочернее поле', async () => {
    const { city, street } = setup();
    fetchMock.mockResolvedValue(reply([CITY]));
    await typeIn(city, 'тверь');
    pick(items()[0]);

    street.value = 'мясницкая';
    city.value = 'тверь и что-то ещё';
    city.dispatchEvent(new Event('input'));
    expect(street.value).toBe('');

    // Даём уйти запросу самого родителя — иначе он попадёт в счётчик вместо дочернего.
    await vi.advanceTimersByTimeAsync(150);
    fetchMock.mockClear();

    await typeIn(street, 'мясницкая');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('смена родителя через setOptions переподключает связь', async () => {
    const first = el();
    const second = el();
    const child = el();
    hints = attachHints(first, { key: 'pk', geo: false, to: 'city' });
    const secondHints = attachHints(second, { key: 'pk', geo: false, to: 'city' });
    extra = attachHints(child, { key: 'pk', geo: false, parent: first });

    extra.setOptions({ parent: second });

    fetchMock.mockResolvedValue(reply([CITY]));
    await typeIn(second, 'тверь');
    pick(items()[0]);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply(TWO));
    await typeIn(child, 'мясницкая');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.locations).toEqual([{ city_fias_id: 'CITY-FIAS' }]);

    secondHints.destroy();
  });

  it('снятие родителя делает поле самостоятельным', async () => {
    const parent = el();
    const child = el();
    hints = attachHints(parent, { key: 'pk', geo: false, to: 'city' });
    extra = attachHints(child, { key: 'pk', geo: false, parent });

    extra.setOptions({ parent: undefined });
    await typeIn(child, 'мясницкая');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('свой уровень поиска сильнее выведенного из родителя', async () => {
    const city = el();
    const house = el();
    hints = attachHints(city, { key: 'pk', geo: false, to: 'city' });
    extra = attachHints(house, { key: 'pk', geo: false, parent: city, from: 'house' });

    fetchMock.mockResolvedValue(reply([CITY]));
    await typeIn(city, 'тверь');
    pick(items()[0]);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply(TWO));
    await typeIn(house, '13');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.from_bound).toEqual({ value: 'house' });
  });
});

describe('fill — одна подсказка заполняет соседние поля', () => {
  it('раскладывает поля и уведомляет их событиями', async () => {
    const zip = el();
    const city = el();
    hints = attachHints(input, {
      key: 'pk',
      geo: false,
      to: 'house',
      fill: { postal: zip, city: city },
    });
    const seen: string[] = [];
    zip.addEventListener('input', () => seen.push('input'));
    zip.addEventListener('change', () => seen.push('change'));

    fetchMock.mockResolvedValue(
      reply([{ value: 'г Тверь, ул Мясницкая', address: { city: 'Тверь' }, codes: { postal: '170100' } }]),
    );
    await typeIn(input, 'мясницкая');
    pick(items()[0]);

    expect(zip.value).toBe('170100');
    expect(city.value).toBe('Тверь');
    expect(seen).toEqual(['input', 'change']);
  });

  it('принимает селекторы', async () => {
    const zip = el();
    zip.id = 'zip';
    hints = attachHints(input, { key: 'pk', geo: false, to: 'house', fill: { postal: '#zip' } });

    fetchMock.mockResolvedValue(reply([{ value: 'адрес', codes: { postal: '170100' } }]));
    await typeIn(input, 'мясницкая');
    pick(items()[0]);
    expect(zip.value).toBe('170100');
  });
});

describe('повторный attachHints', () => {
  it('не оставляет два списка на одном поле', async () => {
    hints = attachHints(input, { key: 'pk', geo: false });
    hints = attachHints(input, { key: 'pk', geo: false });
    await typeIn(input, 'мясницкая');
    expect(document.querySelectorAll('.hd-panel')).toHaveLength(1);
  });
});

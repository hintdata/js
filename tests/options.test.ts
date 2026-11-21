import { describe, expect, it } from 'vitest';
import { formatSub } from '../src/core/address';
import type { Suggestion } from '../src/core/types';
import { parseDataAttrs, resolveOptions } from '../src/widget/options';

describe('resolveOptions — дефолты и клампы', () => {
  it('дефолты пустого конфига', () => {
    expect(resolveOptions({})).toMatchObject({
      service: 'address',
      count: 7,
      minChars: 1,
      delay: 100,
      geo: true,
      inline: false,
      placement: 'auto',
      fields: ['value'],
    });
  });

  it.each([
    ['count', 999, 20],
    ['count', 0, 1],
    ['minChars', 50, 10],
    ['delay', 99999, 2000],
    ['delay', -5, 0],
  ])('%s = %i клампится в %i', (key, given, expected) => {
    expect(resolveOptions({ [key]: given })).toMatchObject({ [key]: expected });
  });

  it.each([
    ['NAME', ['NAME']],
    [' patronymic , surname ', ['SURNAME', 'PATRONYMIC']],
    [['NAME', 'ИМЯ'], ['NAME']],
    ['ИМЯ', null],
  ])('parts %j → %j', (given, expected) => {
    expect(resolveOptions({ parts: given as string }).parts).toEqual(expected);
  });

  it('нечисловое значение откатывается к дефолту', () => {
    expect(resolveOptions({ count: 'много' as unknown as number }).count).toBe(7);
  });

  it('radius переводится в px, без него — из CSS', () => {
    expect(resolveOptions({ radius: 8 }).radius).toBe('8px');
    expect(resolveOptions({ radius: 999 }).radius).toBe('64px');
    expect(resolveOptions({}).radius).toBeNull();
  });

  it('service приводится к нижнему регистру', () => {
    expect(resolveOptions({ service: 'CAR_MODEL' }).service).toBe('car_model');
  });

  it('fields принимает строку через запятую и массив', () => {
    expect(resolveOptions({ fields: 'postal, city ,' }).fields).toEqual(['postal', 'city']);
    expect(resolveOptions({ fields: ['bic'] }).fields).toEqual(['bic']);
  });

  it('неизвестный placement отбрасывается', () => {
    expect(resolveOptions({ placement: 'сбоку' as never }).placement).toBe('auto');
  });

  it('demo по умолчанию раскрывается в потоке, а не оверлеем', () => {
    expect(resolveOptions({ demo: true }).placement).toBe('flow');
    expect(resolveOptions({ demo: true, placement: 'top' }).placement).toBe('top');
  });
});

describe('parseDataAttrs — атрибуты поля', () => {
  const el = (attrs: Record<string, string>): HTMLElement => {
    const input = document.createElement('input');
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    return input;
  };

  it('читает сервис и числовые опции', () => {
    const o = parseDataAttrs(el({ 'data-hintdata': 'bank', 'data-count': '5', 'data-min': '3' }));
    expect(o).toMatchObject({ service: 'bank', count: 5, minChars: 3 });
  });

  it('булевы включены по умолчанию и выключаются строкой false', () => {
    expect(parseDataAttrs(el({ 'data-geo': 'false' })).geo).toBe(false);
    expect(parseDataAttrs(el({ 'data-geo': 'true' })).geo).toBe(true);
    expect(parseDataAttrs(el({})).geo).toBeUndefined();
  });

  it('data-icon: false выключает, true — иконка сервиса, иное — своя разметка', () => {
    expect(parseDataAttrs(el({ 'data-icon': 'false' })).icon).toBe(false);
    expect(parseDataAttrs(el({ 'data-icon': 'true' })).icon).toBe(true);
    expect(parseDataAttrs(el({ 'data-icon': '🏠' })).icon).toBe('🏠');
  });

  it('data-selected — алиас для подстановки после выбора', () => {
    expect(parseDataAttrs(el({ 'data-selected': 'street' })).selected).toBe('street');
  });

  it('data-label — алиас главной строки пункта; без него label = selected', () => {
    expect(parseDataAttrs(el({ 'data-label': 'house' })).label).toBe('house');
    expect(resolveOptions({ selected: 'street' }).label).toBe('street');
    expect(resolveOptions({ selected: 'street', label: 'value' }).label).toBe('value');
    expect(resolveOptions({}).label).toBeNull();
  });

  it('составные имена атрибутов', () => {
    const o = parseDataAttrs(el({ 'data-empty-text': 'Ничего', 'data-honest-threshold': '0.7' }));
    expect(o).toMatchObject({ emptyText: 'Ничего', honestThreshold: 0.7 });
  });

  it('незаданные атрибуты не подменяют дефолты resolveOptions', () => {
    expect(resolveOptions(parseDataAttrs(el({}))).count).toBe(7);
  });
});

describe('locations — формат зависит от сервиса', () => {
  it('address: строка — название региона', () => {
    expect(resolveOptions({ locations: 'Москва' }).locations).toEqual([{ region: 'Москва' }]);
  });

  it('party: двузначный код региона', () => {
    expect(resolveOptions({ service: 'party', locations: '77' }).locations).toEqual([{ region: '77' }]);
  });

  it('party: строка не из двух цифр игнорируется — API отфильтровал бы по несуществующему коду', () => {
    expect(resolveOptions({ service: 'party', locations: 'Москва' }).locations).toBeNull();
  });

  it('party: объект проходит как есть', () => {
    expect(resolveOptions({ service: 'party', locations: { kladr_id: '7700000000000' } }).locations).toEqual([
      { kladr_id: '7700000000000' },
    ]);
  });
});

describe('data-fill-* — индекс массива через подчёркивания', () => {
  it('data-fill-emails_0_value читается как emails.0.value', () => {
    const el = document.createElement('input');
    el.setAttribute('data-fill-emails_0_value', '#mail');
    const fill = parseDataAttrs(el).fill ?? {};
    expect(Object.keys(fill)).toEqual(['emails_0_value']);
    const s = { value: 'x', emails: [{ value: 'a@b.ru' }] } as unknown as Suggestion;
    expect(formatSub(s, Object.keys(fill), false)).toBe('a@b.ru');
  });
});

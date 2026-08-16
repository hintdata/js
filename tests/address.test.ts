import { describe, expect, it } from 'vitest';
import { ADDRESS_FIELD, boostFromLocation, drillStep, formatSub, nextBound } from '../src/core/address';
import type { Suggestion } from '../src/core/types';

const s = (address: Record<string, string>, components: Record<string, { fias_id?: string }> = {}) =>
  ({ value: 'x', address, components }) as unknown as Suggestion;

describe('nextBound — следующий уровень детализации', () => {
  it('дом → квартиры', () => {
    expect(nextBound(s({ city: 'Москва', street: 'Мясницкая', house: '13' }))).toBe('flat');
  });

  it('улица → дома', () => {
    expect(nextBound(s({ city: 'Москва', street: 'Мясницкая' }))).toBe('house');
  });

  it('город → улицы', () => {
    expect(nextBound(s({ region: 'Москва', city: 'Москва' }))).toBe('street');
  });

  it('территория (парк/СНТ) → дома, а не улицы', () => {
    expect(nextBound(s({ city: 'СПб', territory: 'Пискарёвский парк' }))).toBe('house');
  });

  it('квартира — дно', () => {
    expect(nextBound(s({ house: '13', flat: '5' }))).toBeNull();
  });

  it('пустой адрес', () => {
    expect(nextBound({ value: 'x' } as Suggestion)).toBeNull();
  });
});

describe('drillStep — якорь для углубления', () => {
  it('якорит на fias дома', () => {
    const step = drillStep(s({ street: 'Мясницкая', house: '13' }, { house: { fias_id: 'H' } }));
    expect(step).toEqual({ field: 'house_fias_id', fias: 'H', bound: 'flat' });
  });

  it('уровень без своего fias — берём следующий вверх', () => {
    const step = drillStep(s({ street: 'Мясницкая', house: '13' }, { street: { fias_id: 'S' } }));
    expect(step).toEqual({ field: 'street_fias_id', fias: 'S', bound: 'house' });
  });

  it('территория якорится своим fias', () => {
    const step = drillStep(s({ city: 'СПб', territory: 'Парк' }, { territory: { fias_id: 'T' } }));
    expect(step).toEqual({ field: 'territory_fias_id', fias: 'T', bound: 'house' });
  });

  it('без единого fias углубляться нечем', () => {
    expect(drillStep(s({ city: 'Москва' }))).toBeNull();
  });

  it('квартира — дно', () => {
    expect(drillStep(s({ house: '13', flat: '5' }, { house: { fias_id: 'H' } }))).toBeNull();
  });

  it('согласован с nextBound по уровню', () => {
    const item = s({ city: 'СПб', territory: 'Парк' }, { territory: { fias_id: 'T' } });
    expect(drillStep(item)?.bound).toBe(nextBound(item));
  });
});

describe('formatSub — подпись под значением', () => {
  const addr = {
    value: 'г Москва, ул Мясницкая',
    address: { region: 'Москва', city: 'Москва', street: 'Мясницкая' },
    codes: { postal: '101000' },
  } as unknown as Suggestion;

  it('собирает адресные поля через разделитель', () => {
    expect(formatSub(addr, ['postal', 'city'], true)).toBe('101000 · Москва');
  });

  it('пропускает value и пустые поля', () => {
    expect(formatSub(addr, ['value', 'house', 'city'], true)).toBe('Москва');
  });

  it('неадресный сервис читает поля верхнего уровня', () => {
    const bank = { value: 'Сбербанк', bic: '044525225' } as unknown as Suggestion;
    expect(formatSub(bank, ['bic'], false)).toBe('044525225');
  });

  it('неизвестный алиас не ломает подпись', () => {
    expect(formatSub(addr, ['нет-такого', 'city'], true)).toBe('Москва');
  });
});

describe('ADDRESS_FIELD', () => {
  it('кадастровый номер читается из верхнего уровня', () => {
    expect(ADDRESS_FIELD.cadastral({ value: 'x', cadastral_num: '50:21:1' } as Suggestion)).toBe('50:21:1');
  });

  it('geo отдаёт пару координат, а неполные — пусто', () => {
    expect(ADDRESS_FIELD.geo({ value: 'x', geo: { lat: 55.7, lon: 37.6 } } as Suggestion)).toBe('55.7, 37.6');
    expect(ADDRESS_FIELD.geo({ value: 'x', geo: { lat: 55.7 } } as Suggestion)).toBe('');
  });
});

describe('boostFromLocation — гео-приоритет по IP', () => {
  it('город приоритетнее региона', () => {
    const loc = {
      value: 'Москва',
      components: { city: { kladr_id: 'CITY' }, region: { kladr_id: 'REG' } },
    } as unknown as Suggestion;
    expect(boostFromLocation(loc)).toEqual({ kladr_id: 'CITY' });
  });

  it('фед. город: city пуст → берём региональный код', () => {
    const loc = { value: 'СПб', codes: { region_kladr: 'REG' } } as unknown as Suggestion;
    expect(boostFromLocation(loc)).toEqual({ kladr_id: 'REG' });
  });

  it('не определился — буста нет', () => {
    expect(boostFromLocation(null)).toBeNull();
    expect(boostFromLocation({ value: 'x' } as Suggestion)).toBeNull();
  });
});

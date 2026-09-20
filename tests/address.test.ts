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

describe('formatSub: вложенные поля подсказки', () => {
  const party = {
    value: 'ПАО СБЕРБАНК',
    inn: '7707083893',
    name_short: 'ПАО СБЕРБАНК',
    management: { name: 'ГРЕФ ГЕРМАН ОСКАРОВИЧ', post: 'ПРЕЗИДЕНТ', disqualified: null },
    state: { status: 'ACTIVE', code: null },
    emails: [{ value: 'a@sber.ru' }],
    capital: null,
  } as unknown as Suggestion;

  it('читает путь через точку', () => {
    expect(formatSub(party, ['management.name'], false)).toBe('ГРЕФ ГЕРМАН ОСКАРОВИЧ');
    expect(formatSub(party, ['state.status'], false)).toBe('ACTIVE');
  });

  it('читает подчёркивания как путь — единственная форма, выразимая в data-fill-*', () => {
    expect(formatSub(party, ['management_post'], false)).toBe('ПРЕЗИДЕНТ');
  });

  it('ТОЧНОЕ поле верхнего уровня выигрывает у разбора пути', () => {
    // иначе name_short молча превратился бы в name.short и сломал существующие интеграции
    expect(formatSub(party, ['name_short'], false)).toBe('ПАО СБЕРБАНК');
  });

  it('null и отсутствующий шаг дают пустоту, а не «undefined»', () => {
    expect(formatSub(party, ['capital.value'], false)).toBe('');
    expect(formatSub(party, ['management.disqualified.article'], false)).toBe('');
    expect(formatSub(party, ['нет.такого'], false)).toBe('');
  });

  it('проходит сквозь массив по индексу', () => {
    expect(formatSub(party, ['emails.0.value'], false)).toBe('a@sber.ru');
  });

  it('объект целиком по-прежнему пустота, а не [object Object]', () => {
    expect(formatSub(party, ['management'], false)).toBe('');
  });
});

describe('formatSub: адрес — карта плюс общий разбор пути', () => {
  const addr = {
    value: 'г Москва, ул Вавилова, д 19',
    address: { region: 'Москва', city: 'Москва', street: 'Вавилова', house: '19' },
    codes: { postal: '117312', kladr: '7700000000000' },
    geo: { lat: 55.7, lon: 37.6 },
  } as unknown as Suggestion;

  it('курируемые короткие имена работают как раньше', () => {
    expect(formatSub(addr, ['city'], true)).toBe('Москва');
    expect(formatSub(addr, ['postal'], true)).toBe('117312');
    expect(formatSub(addr, ['geo'], true)).toBe('55.7, 37.6');
  });

  it('имени нет в карте — читается путь, а не пустота', () => {
    expect(formatSub(addr, ['address.street'], true)).toBe('Вавилова');
    expect(formatSub(addr, ['codes.kladr'], true)).toBe('7700000000000');
  });

  it('несуществующий путь по-прежнему пустота', () => {
    expect(formatSub(addr, ['нет.такого'], true)).toBe('');
  });

  // ⚠️Курируемое имя ЕСТЬ в карте, но значения нет (у адреса не заполнен район): обязано остаться
  // пустым и НЕ проваливаться в разбор пути — иначе алиас карты начал бы читать чужое поле строки.
  it('пустое значение курируемого имени не проваливается в путь', () => {
    const withArea = { ...addr, area: 'ЧУЖОЕ ЗНАЧЕНИЕ' } as unknown as Suggestion;
    expect(formatSub(withArea, ['area'], true)).toBe('');
  });
});

describe('formatSub — структурный нативный формат организаций', () => {
  // Нативный ответ /v1/suggest/party после отказа от плоской раскладки: сущность — объект.
  const party = {
    value: 'ПАО СБЕРБАНК',
    inn: '7707083893',
    name: { full: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"', short: 'ПАО СБЕРБАНК' },
    fio: null,
    opf: { code: '12247', short: 'ПАО', full: 'Публичное акционерное общество' },
    okved: { code: '64.19', name: 'Денежное посредничество прочее', all: ['64.19', '62.09'] },
    address: {
      value: '117312, Г.МОСКВА, УЛ. ВАВИЛОВА, Д.19',
      postal_code: '117312',
      fias_id: null,
      region: '77',
      region_name: 'Москва г',
      city: null,
    },
    state: { status: 'ACTIVE', actuality_date: '2026-09-03', registration_date: '1991-06-20', liquidation_date: null },
    invalid: null,
    management: { name: 'ГРЕФ ГЕРМАН ОСКАРОВИЧ', post: 'Руководитель юридического лица', disqualified: null },
  } as never;

  it('читает вложенное через точку', () => {
    expect(formatSub(party, ['management.name', 'opf.full'], false)).toBe(
      'ГРЕФ ГЕРМАН ОСКАРОВИЧ · Публичное акционерное общество',
    );
  });

  // ⚠️Главное: в data-fill-* точку написать негде, алиас приходит подчёркиваниями, и
  // `region_name` — это путь address → region_name, а не ключ верхнего уровня.
  it('читает вложенное через подчёркивания, включая составной последний шаг', () => {
    expect(formatSub(party, ['address_region_name'], false)).toBe('Москва г');
    expect(formatSub(party, ['state_actuality_date'], false)).toBe('2026-09-03');
    expect(formatSub(party, ['address_postal_code'], false)).toBe('117312');
    expect(formatSub(party, ['okved_code'], false)).toBe('64.19');
    expect(formatSub(party, ['name_short'], false)).toBe('ПАО СБЕРБАНК');
  });

  it('объект с текстовым value подписывается своим value', () => {
    expect(formatSub(party, ['address'], false)).toBe('117312, Г.МОСКВА, УЛ. ВАВИЛОВА, Д.19');
  });

  it('null-блок и несуществующий путь дают пустоту, а не «undefined»', () => {
    expect(formatSub(party, ['fio.surname', 'invalid.code', 'state.liquidation_date'], false)).toBe('');
    expect(formatSub(party, ['нет_такого_пути'], false)).toBe('');
  });
});

describe('formatSub — структура организаций после перехода на сущности', () => {
  // Ответ /v1/suggest/party в текущей форме: okveds списком, статкоды/капитал/МСП/ФНС объектами.
  const party = {
    value: 'ПАО СБЕРБАНК',
    okveds: [
      { code: '64.19', name: 'Денежное посредничество прочее', main: true, type: '2014' },
      { code: '62.09', name: null, main: false, type: '2014' },
    ],
    codes: { okpo: '00032537', okato: '45293554000', oktmo: '45397000000', okogu: '4100104', okfs: '41' },
    capital: { type: null, value: 67760844000 },
    smb: { category: 'MEDIUM', issued_at: '2016-08-01' },
    fns: { taxes_paid: null, tax_mode: 'ОСН', tax_debt: null, tax_offences: null },
    founders: [{ inn: '7707083893', ogrn: null, name: null, fio: null, type: null, share: null }],
    state: { status: 'ACTIVE', actuality_date: '2026-09-03', registration_date: '1991-06-20', liquidation_date: null },
  } as never;

  it('достаёт поля вложенных сущностей через точку и через подчёркивания', () => {
    expect(formatSub(party, ['codes.okpo'], false)).toBe('00032537');
    expect(formatSub(party, ['codes_okpo'], false)).toBe('00032537');
    expect(formatSub(party, ['capital.value'], false)).toBe('67760844000');
    expect(formatSub(party, ['smb_category'], false)).toBe('MEDIUM');
    expect(formatSub(party, ['smb_issued_at'], false)).toBe('2016-08-01');
    expect(formatSub(party, ['fns_tax_mode'], false)).toBe('ОСН');
  });

  // ⚠️Списки: основной ОКВЭД теперь не поле, а запись в okveds[] с флагом main. В data-fill-*
  // точку не написать, поэтому индекс обязан читаться и через подчёркивания.
  it('читает записи списков по индексу', () => {
    expect(formatSub(party, ['okveds.0.code'], false)).toBe('64.19');
    expect(formatSub(party, ['okveds_0_name'], false)).toBe('Денежное посредничество прочее');
    expect(formatSub(party, ['founders_0_inn'], false)).toBe('7707083893');
  });

  it('сам список и null-значение внутри дают пустоту, а не «[object Object]»', () => {
    expect(formatSub(party, ['okveds'], false)).toBe('');
    expect(formatSub(party, ['okveds_1_name', 'capital_type'], false)).toBe('');
  });
});

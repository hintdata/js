/**
 * Чистые хелперы по адресу (без DOM/сети) — для НАТИВНОГО формата ответа (address/components/codes/geo).
 */
import type { AddressBound, LocationConstraint, Suggestion } from './types.js';

/**
 * alias поля подсказки → извлечение значения из нативного suggestion.
 * Используется для саб-строки подсказки (formatSub) и интеграторами.
 */
export const ADDRESS_FIELD: Record<string, (s: Suggestion) => string> = {
  postal: (s) => s.codes?.postal ?? '',
  region: (s) => s.address?.region ?? '',
  area: (s) => s.address?.area ?? '',
  city: (s) => s.address?.city ?? '',
  settlement: (s) => s.address?.settlement ?? '',
  street: (s) => s.address?.street ?? '',
  house: (s) => s.address?.house ?? '',
  kladr: (s) => s.codes?.kladr ?? '',
  fias: (s) => s.fias_id ?? '',
  cadastral: (s) => s.cadastral_num ?? '',
  geo: (s) => (s.geo?.lat != null && s.geo?.lon != null ? `${s.geo.lat}, ${s.geo.lon}` : ''),
};

/**
 * Лестница drill-down: компонент адреса → уровень его ДЕТЕЙ. Общая для nextBound и drillStep.
 * territory (парк/СНТ/ГСК/кв-л) — уровень между нп и улицей, дети = дома/участки.
 */
const LADDER: Array<{ component: string; bound: AddressBound }> = [
  { component: 'house', bound: 'flat' },
  { component: 'street', bound: 'house' },
  { component: 'territory', bound: 'house' },
  { component: 'settlement', bound: 'house' },
  { component: 'city', bound: 'street' },
  { component: 'area', bound: 'city' },
  { component: 'region', bound: 'city' },
];

/** Квартира/комната — дно: глубже дробить нечего. */
function atBottom(s: Suggestion): boolean {
  const a = s.address ?? {};
  return Boolean(a.flat || a.room);
}

/**
 * Следующий уровень детализации для drill-down — по самому глубокому заполненному компоненту
 * нативного `address`. Запрос той же строки с from_bound на этот уровень вернёт ИМЕННО вложенные
 * объекты (квартиры дома 131), а не соседей того же уровня (131/1, 131/2). null — глубже некуда.
 */
export function nextBound(s: Suggestion): AddressBound | null {
  if (atBottom(s)) return null;
  const a = s.address ?? {};
  return LADDER.find((l) => a[l.component])?.bound ?? null;
}

/**
 * Шаг drill-down по ВЫБРАННОМУ объекту: ЯКОРЬ (родительское `*_fias_id` = own fias самого глубокого
 * заполненного компонента) + следующий уровень. Без якоря переповтор одного ТЕКСТА неоднозначен:
 * тип-слова («парк», «тупик») цепляют чужие объекты (на «парк Пискарёвский» вылезал Бутово-Парк).
 * С якорем дрилим строго детей этого объекта. null — глубже некуда или нет fias.
 */
export function drillStep(s: Suggestion): { field: string; fias: string; bound: AddressBound } | null {
  if (atBottom(s)) return null;
  const a = s.address ?? {};
  const c = s.components ?? {};
  // Уровень без своего fias якорить нечем — берём следующий вверх, у которого fias есть.
  for (const l of LADDER) {
    const fias = a[l.component] ? c[l.component]?.fias_id || '' : '';
    if (fias) return { field: `${l.component}_fias_id`, fias, bound: l.bound };
  }
  return null;
}

/**
 * Саб-строка подсказки из набора полей. `value` пропускается.
 *
 * У адреса сперва работает карта ADDRESS_FIELD: короткие имена (`city`, `postal`, `geo`) прячут
 * вложенность нативного ответа и складывают координаты в одну строку. Имя, которого в карте нет,
 * разбирается общим путём, как у других сервисов: так работает, например, `data-fill-codes-oktmo` (`codes.oktmo`).
 */
export function formatSub(s: Suggestion, fields: string[], isAddress: boolean): string {
  const out: string[] = [];
  for (const f of fields) {
    if (f === 'value') continue;
    const mapped = isAddress ? ADDRESS_FIELD[f]?.(s) : undefined;
    const v = mapped ?? scalar(pick(s, f));
    if (v) out.push(v);
  }
  return out.join(', ');
}

/**
 * Значение подсказки по алиасу, в том числе ВЛОЖЕННОЕ: `management.name`, `state.status`,
 * `emails.0.value`: так к полю формы привязываются руководитель, статус и другие вложенные данные.
 *
 * Порядок разбора (у адреса короткие имена из ADDRESS_FIELD formatSub берёт ДО pick и они сильнее всего ниже):
 *   1. ТОЧНОЕ поле верхнего уровня — выигрывает всегда (`name_short`, `opf_full`, `invalid_code`
 *      остаются собой и не превращаются в путь);
 *   2. алиас с точкой — путь как написан;
 *   3. иначе подчёркивания читаются как путь. Это единственный способ выразить вложенность в
 *      `data-fill-*`, где алиас берётся из ИМЕНИ атрибута и точку туда не записать:
 *      `data-fill-management-name` → `management_name` → `management.name`.
 *
 * Любой отсутствующий или null-шаг обрывает разбор — наружу уйдёт пустая строка, а не «undefined».
 */
function pick(s: Suggestion, alias: string): unknown {
  if (alias in s) return unwrap(s[alias]);
  if (alias.includes('.')) {
    let cur: unknown = s;
    for (const step of alias.split('.')) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[step];
    }
    return unwrap(cur);
  }
  return unwrap(descend(s, alias.split('_')));
}

/**
 * Разбор подчёркиваний, когда точку написать негде (`data-fill-*`). Подчёркивание неоднозначно:
 * `region_name` — это и возможный ключ `region_name`, и путь `address` → `region_name`. Поэтому на
 * каждом уровне берём САМЫЙ ДЛИННЫЙ подходящий ключ и спускаемся остатком; не нашлось глубже —
 * отступаем к более короткому. Простое `split('_')` умело только первое и ломалось на
 * `address.region_name`, `state.actuality_date`, `okved.code`.
 */
function descend(obj: unknown, tokens: string[]): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (let take = tokens.length; take >= 1; take--) {
    const key = tokens.slice(0, take).join('_');
    if (!(key in rec)) continue;
    if (take === tokens.length) return rec[key];
    const deeper = descend(rec[key], tokens.slice(take));
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

/**
 * Объект с текстовым `value` подписывается своим `value`: так устроены и наш `address`, и форма
 * DaData `{value, unrestricted_value}`. Без этого `data-fields="address"` после перехода адреса в
 * объект отдавал бы пустоту — то есть выглядел бы как «данных нет».
 */
function unwrap(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const inner = (raw as Record<string, unknown>).value;
    if (typeof inner === 'string' || typeof inner === 'number') return inner;
  }
  return raw;
}

/** Только скаляр: объект или массив в подписи дал бы «[object Object]». */
function scalar(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

/**
 * Мягкий гео-буст из нативного iplocate-ответа: ОДИН иерархический KLADR — city-уровень, иначе region.
 * KLADR содержит регион в префиксе, поэтому отдельный region_kladr_id избыточен. Движок по структуре
 * кода сам выбирает уровень (регион/город) и добавляет региональную доминанту по первым 2 цифрам.
 * Фед.города: city-KLADR пуст → region-KLADR.
 */
export function boostFromLocation(loc: Suggestion | null): LocationConstraint | null {
  if (!loc) return null;
  const kladr = loc.components?.city?.kladr_id || loc.codes?.region_kladr || loc.components?.region?.kladr_id;
  return kladr ? { kladr_id: kladr } : null;
}

/**
 * Опции виджета: программные (attachHints(input, options)) и из data-* (standalone /widget.js).
 * resolveOptions применяет дефолты/клампы → ResolvedOptions (с ними работает Widget).
 */
import type { HintData, HintDataError } from '../core/client';
import type { FioPart, LocationConstraint, Service, Suggestion } from '../core/types';

/** Колбэки кастомизации (как у dadata). */
export interface WidgetCallbacks {
  /** Выбрана подсказка (клик/Enter). */
  onSelect?: (suggestion: Suggestion) => void;
  /** Пришёл список подсказок (после запроса). */
  onSearchComplete?: (suggestions: Suggestion[]) => void;
  /**
   * Запрос не удался. Виджет гасит сбой сам (просто не открывает список), поэтому без этого колбэка
   * отозванный ключ и превышенный лимит выглядят снаружи так же, как «ничего не нашлось».
   */
  onError?: (error: HintDataError) => void;
  /**
   * Поле потеряло фокус, а значение не выбрано из подсказок. Нужно, чтобы отличить подтверждённый
   * объект (есть `fias_id`) от текста, набранного руками — например, перед оформлением доставки.
   */
  onSelectNothing?: (value: string) => void;
  /** Своя разметка пункта: вернуть HTML для внутренностей `.hd-item` (иначе дефолт: значение+саб-строка). */
  formatResult?: (suggestion: Suggestion, query: string) => string;
  /** Что подставить в поле при выборе (иначе `suggestion.value` целиком). */
  formatSelected?: (suggestion: Suggestion) => string;
}

/** Публичные опции attachHints. Всё опционально — дефолты в resolveOptions. */
export interface WidgetOptions extends WidgetCallbacks {
  /** Сервис подсказок, по умолчанию address. `string & {}` — чтобы редактор подсказывал known-значения,
   *  но новый домен шлюза можно было передать до обновления пакета. */
  service?: Service | (string & {});
  /** Публичный pk_-ключ. */
  key?: string;
  /** База API (по умолчанию https://api.hintdata.ru). */
  url?: string;
  /**
   * Готовый клиент на всю форму. Без него каждое поле заводит свой — со своим кэшем, поэтому
   * одинаковый запрос в двух полях уходит и тарифицируется дважды.
   */
  client?: HintData;
  /**
   * Поле-родитель (элемент или CSS-селектор) — связанные поля без ручной обвязки. Пока в родителе
   * ничего не выбрано, это поле выключено; после выбора виджет сам якорит поиск по `fias_id`
   * выбранного объекта и переходит на следующий уровень. Правка родителя сбрасывает цепочку.
   */
  parent?: string | HTMLInputElement | HTMLTextAreaElement;
  /**
   * Разложить выбранную подсказку по соседним полям: алиас поля → элемент или CSS-селектор.
   * Например `{ postal: '#zip', city: '#city' }`. Алиасы — как у `fields`.
   */
  fill?: Record<string, string | HTMLInputElement>;
  accent?: string;
  radius?: number;
  /** Иконка у каждого результата: false (умолч.) — нет; true — стрелка-метка; строка — свой HTML/SVG/emoji. */
  icon?: boolean | string;
  /** Поля саб-строки (строка/массив; умолч. "value" — только значение, без саб-строки, как у dadata). */
  fields?: string[] | string;
  /**
   * Что подставить в поле после выбора — алиас поля, как у `fields`/`fill`; по умолчанию `value`,
   * полный текст подсказки. Для связанных полей `data-selected="street"` оставляет в поле только
   * улицу, а не полный адрес, который туда кладёт родитель.
   */
  selected?: string;
  /**
   * Главная строка пункта списка — алиас поля, как у `selected`. По умолчанию равна `selected`: если в
   * поле уходит только улица, список тоже показывает улицы («Пискунова»), а не полный адрес. `label: 'value'`
   * возвращает полный текст в список при сохранении `selected`. Пустой алиас у подсказки — полный `value`.
   */
  label?: string;
  /** Текст-подсказка под списком (умолч. "" — скрыто, чистый дропдаун; задать строку чтобы показать). */
  hint?: string;
  emptyText?: string;
  /** Честный «адрес не найден» при низкой уверенности реранкера (только address; умолч. false, opt-in). */
  honest?: boolean;
  /** Текст-шапка при низкой уверенности (умолч. «Адрес не найден. Возможно, вы искали:»). */
  honestText?: string;
  /** Порог confidence (0..1) ниже которого = «не найден» (умолч. 0.3). */
  honestThreshold?: number;
  count?: number;
  minChars?: number;
  delay?: number;
  /** Гео-приоритет по IP (только address, по умолчанию true). */
  geo?: boolean;
  /**
   * Ограничить территорией (только address). Строка — сокращение для региона; объект или массив —
   * любое ограничение API: `{ city: 'Тверь' }`, `{ city_fias_id: '…' }`. Для связанных полей точнее
   * ограничивать по `*_fias_id` выбранного объекта, а не по имени.
   */
  locations?: string | LocationConstraint | LocationConstraint[];
  /** Срез по уровню from_bound/to_bound (только address). */
  from?: string;
  to?: string;
  /**
   * Только эти части ФИО (только fio): массив или строка через запятую — `'NAME'`, `'SURNAME,PATRONYMIC'`.
   * Для отдельных полей формы: поле «Имя» подсказывает имена, а не полные ФИО.
   */
  parts?: FioPart[] | string;
  /** Выпадашка в контейнере поля (а не плавающая на body) — для встраивания в свой блок. */
  inline?: boolean;
  /**
   * Позиция выпадашки. auto (умолч.) — поверх контента вниз от поля, при нехватке места во
   * вьюпорте — вверх (высота клампится к доступному месту); top/bottom — фиксированная сторона;
   * flow — в потоке документа под полем (двигает контент ниже; умолчание demo-режима — для
   * постоянно открытых витрин).
   */
  placement?: 'auto' | 'bottom' | 'top' | 'flow';
  /** @internal Витрина без сети для наших демо-страниц: данные из demoItems, в документацию не выносим. */
  demo?: boolean;
  /** @internal */
  demoEmpty?: boolean;
  /** @internal */
  demoItems?: Suggestion[];
}

export interface ResolvedOptions extends WidgetCallbacks {
  service: string;
  accent: string | null;
  radius: string | null;
  icon: boolean | string;
  fields: string[];
  selected: string | null;
  label: string | null;
  hint: string;
  emptyText: string;
  honest: boolean;
  honestText: string;
  honestThreshold: number;
  count: number;
  minChars: number;
  delay: number;
  geo: boolean;
  locations: LocationConstraint[] | null;
  from: string | null;
  to: string | null;
  parts: FioPart[] | null;
  inline: boolean;
  placement: 'auto' | 'bottom' | 'top' | 'flow';
  demo: boolean;
  demoEmpty: boolean;
  demoItems: Suggestion[] | null;
  parent: string | HTMLInputElement | HTMLTextAreaElement | null;
  fill: Record<string, string | HTMLInputElement> | null;
}

const PLACEMENTS = ['auto', 'bottom', 'top', 'flow'] as const;

const clampInt = (v: unknown, min: number, max: number, def: number): number => {
  // из data-* значение приходит строкой; всё прочее (объект, undefined) — к дефолту
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
};

const FIO_PARTS: readonly FioPart[] = ['SURNAME', 'NAME', 'PATRONYMIC'];

/** Части ФИО из массива или строки через запятую; неизвестные отбрасываются, пусто — null. */
function toParts(v: WidgetOptions['parts']): FioPart[] | null {
  if (!v) return null;
  const list = ('string' === typeof v ? v.split(',') : v).map((p) => p.trim().toUpperCase());
  const parts = FIO_PARTS.filter((p) => list.includes(p));
  return parts.length ? parts : null;
}

/** Строка — сокращение для региона (в т.ч. из data-locations); объект/массив идут в API как есть. */
function toLocations(v: WidgetOptions['locations']): LocationConstraint[] | null {
  if (!v) return null;
  if ('string' === typeof v) return [{ region: v }];
  const list = Array.isArray(v) ? v : [v];
  return list.length ? list : null;
}

export function resolveOptions(o: WidgetOptions): ResolvedOptions {
  const service = (o.service || 'address').toString().toLowerCase();
  const fields = Array.isArray(o.fields)
    ? o.fields
    : (o.fields || 'value')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return {
    service,
    accent: o.accent || null,
    radius: o.radius != null ? `${clampInt(o.radius, 0, 64, 12)}px` : null,
    icon: o.icon ?? false,
    fields,
    selected: o.selected || null,
    label: o.label || o.selected || null,
    hint: o.hint ?? '',
    emptyText: o.emptyText || '',
    honest: o.honest ?? false,
    honestText: o.honestText ?? 'Адрес не найден. Возможно, вы искали:',
    honestThreshold: typeof o.honestThreshold === 'number' ? o.honestThreshold : 0.3,
    count: clampInt(o.count, 1, 20, 7),
    minChars: clampInt(o.minChars, 1, 10, 1),
    delay: clampInt(o.delay, 0, 2000, 100),
    geo: o.geo ?? true,
    locations: toLocations(o.locations),
    from: o.from || null,
    to: o.to || null,
    parts: toParts(o.parts),
    inline: o.inline ?? false,
    // demo — постоянно открытая витрина: ей по умолчанию место в потоке, а не оверлей
    placement: PLACEMENTS.find((p) => p === o.placement) ?? (o.demo ? 'flow' : 'auto'),
    demo: o.demo ?? false,
    demoEmpty: o.demoEmpty ?? false,
    demoItems: o.demoItems ?? null,
    parent: o.parent ?? null,
    fill: o.fill ?? null,
    onSelect: o.onSelect,
    onSearchComplete: o.onSearchComplete,
    onError: o.onError,
    onSelectNothing: o.onSelectNothing,
    formatResult: o.formatResult,
    formatSelected: o.formatSelected,
  };
}

/** data-* на поле → WidgetOptions (для standalone /widget.js). Колбэки через data-* не задаются. */
export function parseDataAttrs(el: HTMLElement): WidgetOptions {
  const d = el.dataset;
  const num = (v: string | undefined): number | undefined => (v == null ? undefined : parseInt(v, 10));
  return {
    service: d.hintdata,
    key: d.key,
    url: d.url,
    accent: d.accent,
    radius: num(d.radius),
    // data-icon: "false"/нет → выкл; "true" → стрелка-метка; иное → свой HTML/SVG/emoji
    icon: d.icon == null ? undefined : d.icon === 'false' ? false : d.icon === 'true' ? true : d.icon,
    fields: d.fields,
    selected: d.selected,
    label: d.label,
    hint: d.hint,
    emptyText: d.emptyText,
    honest: d.honest == null ? undefined : d.honest !== 'false',
    honestText: d.honestText,
    honestThreshold: d.honestThreshold == null ? undefined : parseFloat(d.honestThreshold),
    count: num(d.count),
    minChars: num(d.min),
    delay: num(d.delay),
    geo: d.geo == null ? undefined : d.geo !== 'false',
    locations: d.locations,
    from: d.from,
    to: d.to,
    parts: d.parts,
    inline: d.inline === 'true' ? true : undefined,
    placement: d.placement as WidgetOptions['placement'], // валидация — в resolveOptions
    demo: d.demo === 'true' ? true : undefined,
    demoEmpty: d.demoEmpty === 'true' ? true : undefined,
    parent: d.parent,
    fill: parseFill(d),
  };
}

/** `data-fill-postal="#zip"` → `{ postal: '#zip' }`. Алиасы полей — как у data-fields. */
function parseFill(d: DOMStringMap): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (!v || !k.startsWith('fill') || 'fill' === k) continue;
    // fillPostal → postal, fillCityFiasId → city_fias_id
    const alias = k
      .slice(4)
      .replace(/^([A-Z])/, (c) => c.toLowerCase())
      .replace(/([A-Z])/g, (c) => '_' + c.toLowerCase());
    out[alias] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

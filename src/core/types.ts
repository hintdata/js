/**
 * Типы hintdata.ru, общие для клиента и виджета. Формат ответа нативный, вложенный:
 * address/components/codes/geo. Для переезда с DaData есть отдельный совместимый слой
 * `/suggestions/api/4_1/rs/` (плоский data), но клиент и виджет работают с нативным форматом.
 */

/**
 * Сервисы подсказок (они же часть пути запроса). Телефона среди них нет: его можно только
 * стандартизировать, подсказок по нему нет.
 */
export type Service =
  | 'address'
  /** Кадастр: доступен и по браузерному pk_, но тарифицируется за каждый запрос — в открытом виджете
   *  ограничьте ключ списком сайтов и/или IP. */
  | 'cadastre'
  | 'fio'
  /** Организации и ИП: поиск по названию, ИНН или ОГРН. В ответе есть inn, ogrn, kpp и вложенный name. */
  | 'party'
  | 'bank'
  | 'email'
  | 'country'
  | 'currency'
  | 'okved'
  | 'okpd2'
  | 'oktmo'
  | 'metro'
  | 'fms_unit'
  | 'fns_unit'
  | 'car_brand'
  | 'car_model'
  | 'mktu'
  | 'medical_position'
  | 'court'
  | 'customs'
  | 'okpdtr_profession'
  | 'okpdtr_position'
  | 'postal_office';

/** Компонент адреса (region/city/street/…): имя + тип + коды. */
export interface AddressComponent {
  name?: string;
  type?: string;
  fias_id?: string;
  kladr_id?: string;
}

/**
 * Подсказка в нативном формате. У address заполнены address/components/codes/geo/fias_id;
 * у остальных сервисов (fio: part/gender; bank: bic/swift; …) поля лежат на верхнем уровне — отсюда
 * индексная сигнатура. value — главная строка для показа.
 */
export interface Suggestion {
  value: string;
  full?: string;
  level?: string;
  /** Уверенность 0–1 (только address): низкая — адрес сомнителен. */
  confidence?: number;
  /** Плоские имена компонентов: { region, area, city, settlement, street, house, flat, … }. */
  address?: Record<string, string>;
  /** Детальные компоненты: { region: {name,type,fias_id,kladr_id}, … }. */
  components?: Record<string, AddressComponent>;
  /** Коды: { postal, kladr, region_kladr, okato, oktmo }. */
  codes?: Record<string, string>;
  /** Кадастровый номер объекта (на верхнем уровне, не в codes). Доступен не на всех тарифах. */
  cadastral_num?: string;
  geo?: { lat?: number; lon?: number; precision?: string };
  fias_id?: string;
  fias_level?: number;
  /** Поля не-address сервисов (top-level). */
  [key: string]: unknown;
}

/** Ограничение или предпочтение по территории: названия (`city`, `region`) или коды (`city_fias_id`, `region_kladr_id`). */
export type LocationConstraint = Record<string, string>;

/** Уровень детализации адреса для срезов from_bound/to_bound. */
export type AddressBound = 'region' | 'area' | 'city' | 'settlement' | 'street' | 'house' | 'flat';

/** Часть ФИО: подсказки для отдельного поля «Фамилия», «Имя» или «Отчество». */
export type FioPart = 'SURNAME' | 'NAME' | 'PATRONYMIC';

/** Опции запроса подсказок. */
export interface SuggestOptions {
  /** Сколько подсказок вернуть (1–20). */
  count?: number;
  /** Жёсткий фильтр по территории (address и party). */
  locations?: LocationConstraint[];
  /** Мягкое предпочтение территории: поднимает выше, не отсекает (address и party). */
  locationsBoost?: LocationConstraint[];
  /** Нижняя граница среза по уровню (только address). */
  fromBound?: AddressBound;
  /** Верхняя граница среза по уровню (только address). */
  toBound?: AddressBound;
  /** Только эти части ФИО (только fio): поле «Имя» подсказывает имена, а не полные ФИО. */
  parts?: FioPart[];
  /** Отмена запроса, например при быстром наборе. */
  signal?: AbortSignal;
}

/** Настройки клиента. */
export interface HintDataConfig {
  /** База API (по умолчанию https://api.hintdata.ru). */
  url?: string;
  /** Таймаут запроса, мс (по умолчанию 3000). */
  timeout?: number;
  /** Отключить кэш ответов (по умолчанию кэш включён). */
  noCache?: boolean;
}

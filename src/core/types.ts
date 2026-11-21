/**
 * Типы ядра hint-data (общие для пакета и виджета). Формат ответа — НАШ нативный (вложенный:
 * address/components/codes/geo), как отдаёт `/api/v1/...`. Для миграции с dadata есть отдельный
 * dadata-совместимый слой `/suggestions/api/4_1/rs/` (плоский data) — но наш виджет/SDK на нативном.
 */

/**
 * Поддерживаемые сервисы подсказок (домен в пути запроса) — синхронизировано со шлюзом
 * api.hintdata.ru. Телефон саджеста не имеет — он только в стандартизации (clean-only).
 */
export type Service =
  | 'address'
  /** Кадастр: доступен и по браузерному pk_ (ScopePolicy.IsPublicRoute), но metered — каждый запрос
   *  списывается с пакета владельца ключа — в открытом виджете ограничьте ключ списком сайтов и/или IP. */
  | 'cadastre'
  | 'fio'
  /** Организации и ИП: поиск по названию, ИНН или ОГРН. В ответе inn/ogrn/kpp и вложенный name. */
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
 * Подсказка в НАТИВНОМ формате. Для address заполнены address/components/codes/geo/fias_id;
 * у прочих сервисов (fio: part/gender; bank: bic/swift; …) поля лежат top-level — отсюда индексная
 * сигнатура. value — главная строка для отображения.
 */
export interface Suggestion {
  value: string;
  full?: string;
  level?: string;
  /** P(correct) реранкера 0..1 (только address+reranker): низкая → адрес сомнителен (honest-unknown). */
  confidence?: number;
  /** Плоские имена компонентов: { region, area, city, settlement, street, house, flat, … }. */
  address?: Record<string, string>;
  /** Детальные компоненты: { region: {name,type,fias_id,kladr_id}, … }. */
  components?: Record<string, AddressComponent>;
  /** Коды: { postal, kladr, region_kladr, okato, oktmo }. */
  codes?: Record<string, string>;
  /** Кадастровый номер объекта (top-level, НЕ в codes; гейтится тарифом address_cadastral). */
  cadastral_num?: string;
  geo?: { lat?: number; lon?: number; precision?: string };
  fias_id?: string;
  fias_level?: number;
  /** Поля не-address сервисов (top-level). */
  [key: string]: unknown;
}

/** Запись фильтра/буста по территории (поля: name `city`/`region` или коды `city_fias_id`/`region_kladr_id`). */
export type LocationConstraint = Record<string, string>;

/** Уровень детализации адреса для срезов from_bound/to_bound. */
export type AddressBound = 'region' | 'area' | 'city' | 'settlement' | 'street' | 'house' | 'flat';

/** Опции запроса подсказок. */
/** Часть ФИО: подсказки для отдельного поля «Фамилия», «Имя» или «Отчество». */
export type FioPart = 'SURNAME' | 'NAME' | 'PATRONYMIC';

export interface SuggestOptions {
  /** Сколько подсказок вернуть (1–20). */
  count?: number;
  /** Жёсткий фильтр по территории (только address). */
  locations?: LocationConstraint[];
  /** Мягкое предпочтение территории — поднимает выше, не отсекает (только address). */
  locationsBoost?: LocationConstraint[];
  /** Нижняя граница среза по уровню (только address). */
  fromBound?: AddressBound;
  /** Верхняя граница среза по уровню (только address). */
  toBound?: AddressBound;
  /** Только эти части ФИО (только fio): поле «Имя» подсказывает имена, а не полные ФИО. */
  parts?: FioPart[];
  /** Отмена запроса (для гонок ввода). */
  signal?: AbortSignal;
}

/** Конфиг клиента. */
export interface HintDataConfig {
  /** База API (по умолчанию https://api.hintdata.ru). */
  url?: string;
  /** Таймаут запроса, мс (по умолчанию 3000). */
  timeout?: number;
  /** Отключить кэш ответов (по умолчанию кэш включён). */
  noCache?: boolean;
}

# @hintdata/js

Подсказки и стандартизация данных [hint-data](https://hintdata.ru): адреса ГАР/ФИАС, кадастр, справочники.
Один пакет — два сценария: **готовый виджет** автодополнения или **клиент данных** для своего UI.
Zero-deps, TypeScript, ESM + CJS + сборка для `<script>`.

```bash
npm i @hintdata/js
```

---

## Оглавление

- [Быстрый старт](#быстрый-старт)
- [Ключи](#ключи)
- [Сервисы](#сервисы)
- [Виджет: опции](#виджет-опции)
- [Виджет: события и колбэки](#виджет-события-и-колбэки)
- [Виджет: внешний вид](#виджет-внешний-вид)
- [Подключение без сборки (`<script>` + `data-*`)](#подключение-без-сборки)
- [Клиент данных `HintData`](#клиент-данных-hintdata)
- [Обработка ошибок](#обработка-ошибок)
- [Лимиты](#лимиты)
- [Формат ответа](#формат-ответа)
- [Интеграция с фреймворками](#интеграция-с-фреймворками)
- [Готовые примеры](#готовые-примеры)

---

## Быстрый старт

```ts
import { attachHints } from '@hintdata/js';

const hints = attachHints(document.querySelector('#addr'), {
  service: 'address',
  key: 'pk_xxx',
  onSelect: (s) => console.log(s.value, s.address, s.geo),
});

hints.setOptions({ locations: 'Москва' }); // сузить поиск на лету
hints.clear(); // очистить поле и список
hints.disable(); // приостановить подсказки
hints.enable();
hints.destroy(); // снять виджет
```

Виджет сам делает debounce, отменяет устаревшие запросы, углубляется по уровням (город → улица → дом →
квартира) и поднимает выше подсказки из региона пользователя по IP.

---

## Ключи

Два типа, различаются префиксом:

| Ключ  | Где используется                     | Что доступно                                         |
| ----- | ------------------------------------ | ---------------------------------------------------- |
| `pk_` | браузер (виджет, публичный фронтенд) | `suggest` по любому сервису, `geolocate`, `iplocate` |
| `sk_` | только сервер                        | всё, включая `find` и стандартизацию                 |

`pk_` не является секретом — он виден в исходниках страницы. Ограничить его можно списком разрешённых
IP в личном кабинете; заголовок `Referer` не проверяется. Кадастр доступен и по `pk_`, но тарифицируется
за запрос — если ставите его в открытый браузерный виджет, ограничение по IP обязательно.

---

## Сервисы

Значение опции `service` (и атрибута `data-hintdata`):

| Код                                                        | Что подсказывает                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `address`                                                  | адреса ГАР/ФИАС — от региона до квартиры                               |
| `cadastre`                                                 | кадастровые номера и объекты недвижимости _(тарифицируется за запрос)_ |
| `fio`                                                      | ФИО с определением пола и частей имени                                 |
| `party`                                                    | организации и ИП по названию, ИНН или ОГРН: реквизиты и статус         |
| `bank`                                                     | банки по названию/БИК/SWIFT                                            |
| `email`                                                    | почтовые адреса и домены                                               |
| `country`, `currency`                                      | страны, валюты                                                         |
| `okved`, `okpd2`, `oktmo`                                  | классификаторы                                                         |
| `metro`                                                    | станции метро                                                          |
| `fns_unit`, `fms_unit`                                     | подразделения ФНС и МВД                                                |
| `car_brand`, `car_model`                                   | марки и модели автомобилей                                             |
| `mktu`                                                     | классы МКТУ (товарные знаки)                                           |
| `medical_position`, `okpdtr_profession`, `okpdtr_position` | должности и профессии                                                  |
| `court`, `customs`, `postal_office`                        | суды, таможни, почтовые отделения                                      |

Неизвестный код виджет заменяет на `address` и один раз пишет предупреждение в консоль.

Drill-down, гео-приоритет и опции `from`/`to`/`locations` работают только для `address` — остальные сервисы
рисуются как плоский список «значение + подпись».

---

## Виджет: опции

`attachHints(input, options)`. Все опции необязательны.

### Подключение

| Опция     | Тип                                 | Дефолт                    | Описание                                     |
| --------- | ----------------------------------- | ------------------------- | -------------------------------------------- |
| `service` | `string`                            | `'address'`               | сервис из таблицы выше                       |
| `key`     | `string`                            | —                         | публичный ключ `pk_`                         |
| `url`     | `string`                            | `https://api.hintdata.ru` | своя база API (прокси, стенд)                |
| `client`  | `HintData`                          | —                         | общий клиент на форму (см. ниже)             |
| `parent`  | `string \| Element`                 | —                         | поле-родитель: связанные поля без обвязки    |
| `fill`    | `Record<string, string \| Element>` | —                         | разложить выбранный объект по соседним полям |

### Поведение ввода

| Опция         | Тип                            | Дефолт | Лимит  | Описание                                                                          |
| ------------- | ------------------------------ | ------ | ------ | --------------------------------------------------------------------------------- |
| `count`       | `number`                       | `7`    | 1–20   | сколько подсказок показывать                                                      |
| `minChars`    | `number`                       | `1`    | 1–10   | с какого символа запрашивать                                                      |
| `delay`       | `number`                       | `100`  | 0–2000 | пауза после набора, мс                                                            |
| `geo`         | `boolean`                      | `true` | —      | поднимать выше адреса из региона по IP (только `address`)                         |
| `locations`   | `string \| object \| object[]` | —      | —      | ограничить территорией: `'Москва'` (регион) или `{ city_fias_id: '…' }`           |
| `from` / `to` | `string`                       | —      | —      | срез по уровню: `region`, `area`, `city`, `settlement`, `street`, `house`, `flat` |

`to` фиксирует нижний уровень и одновременно выключает углубление: `to: 'city'` даёт выбор только городов.

### Вид

| Опция       | Тип                                     | Дефолт      | Лимит | Описание                                                          |
| ----------- | --------------------------------------- | ----------- | ----- | ----------------------------------------------------------------- |
| `placement` | `'auto' \| 'bottom' \| 'top' \| 'flow'` | `'auto'`    | —     | где раскрывается список                                           |
| `inline`    | `boolean`                               | `false`     | —     | список внутри контейнера поля, а не на `body`                     |
| `accent`    | `string`                                | цвет из CSS | —     | цвет выделения, любой CSS-цвет                                    |
| `radius`    | `number`                                | из CSS      | 0–64  | скругление, px; не задан — берётся `--hd-rad`                     |
| `icon`      | `boolean \| string`                     | `false`     | —     | `true` — иконка сервиса, строка — свой HTML/SVG/эмодзи            |
| `fields`    | `string[] \| string`                    | `'value'`   | —     | поля подписи под значением                                        |
| `hint`      | `string`                                | `''`        | —     | текст-шапка над списком                                           |
| `emptyText` | `string`                                | `''`        | —     | текст при пустом результате; пусто — список просто не открывается |

`placement`: `auto` раскрывает вниз поверх контента, а у нижнего края экрана — вверх, подгоняя высоту под
свободное место. `bottom`/`top` фиксируют сторону. `flow` встраивает список в поток документа, сдвигая
контент ниже — для постоянно раскрытых блоков.

`fields` для адреса принимает: `postal`, `region`, `area`, `city`, `settlement`, `street`, `house`,
`kladr`, `fias`, `cadastral`, `geo`. Для остальных сервисов — любое поле ответа. Например
`fields: ['postal', 'region']` даст подпись «101000 · Москва».

### Честный результат

Только для `address`. Если реранкер не уверен в конкретном доме, над списком появляется предупреждение
вместо молчаливой выдачи «похожего».

| Опция             | Тип       | Дефолт                                    | Описание                                                          |
| ----------------- | --------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `honest`          | `boolean` | `false`                                   | включить предупреждение                                           |
| `honestText`      | `string`  | `'Адрес не найден. Возможно, вы искали:'` | текст предупреждения                                              |
| `honestThreshold` | `number`  | `0.3`                                     | порог уверенности 0–1, ниже которого адрес считается сомнительным |

---

## Виджет: события и колбэки

```ts
attachHints(input, {
  onSelect: (suggestion) => {}, // выбрана подсказка — кликом или Enter
  onSearchComplete: (suggestions) => {}, // пришёл список
  onError: (e) => console.warn(e.code), // запрос не удался: unauthorized, rate_limited, …
  onSelectNothing: (value) => {}, // ушли из поля, не выбрав из подсказок
  formatResult: (suggestion, query) => `<b>${suggestion.value}</b>`, // своя разметка пункта
  formatSelected: (suggestion) => suggestion.address.street, // что подставить в поле
});
```

`onError` стоит подключать всегда. Виджет гасит сбой сам — список просто не открывается, — поэтому без
него отозванный ключ, исчерпанный лимит и «действительно ничего не нашлось» выглядят одинаково.

`onSelectNothing` отвечает на вопрос «объект подтверждён или набран руками»: срабатывает, когда поле
теряет фокус со значением, которого нет среди выбранных. Для доставки это разница между адресом
с `fias_id` и свободным текстом.

После выбора виджет проставляет значение в поле и рассылает три события: `input`, `change` и
`hintdata:select` с `detail: { value, suggestion }`.

```ts
input.addEventListener('hintdata:select', (e) => console.log(e.detail.suggestion));
```

Клавиатура: `↑`/`↓` — перебор, `Enter` — выбрать активную, `Esc` — закрыть.

### Управление живым виджетом

`attachHints` возвращает объект с методами:

| Метод               | Что делает                                                    |
| ------------------- | ------------------------------------------------------------- |
| `setOptions(patch)` | заменить часть опций, не пересоздавая виджет и не теряя фокус |
| `clear()`           | очистить поле, список и отметку о подтверждённом выборе       |
| `disable()`         | приостановить подсказки, оставив виджет на поле               |
| `enable()`          | вернуть подсказки                                             |
| `destroy()`         | снять обработчики и убрать выпадашку                          |

### Связанные поля

Опция `parent` связывает поля сама: пока в родителе ничего не выбрано, дочернее выключено, а после
выбора виджет якорит поиск по `fias_id` выбранного объекта и переходит на уровень детей. Правка
родителя сбрасывает цепочку. Ограничение идёт по идентификатору, а не по названию — одноимённых улиц
в стране много, а `fias_id` один.

```ts
const city = attachHints(cityInput, { client, from: 'city', to: 'city' });
const street = attachHints(streetInput, { client, parent: cityInput, to: 'street' });
const house = attachHints(houseInput, { client, parent: streetInput, to: 'house' });
```

То же самое без сборщика — атрибутом, без единой строки JS:

```html
<input data-hintdata="address" id="city" data-from="city" data-to="city" />
<input data-hintdata="address" data-parent="#city" data-to="street" />
```

Свой `from` сильнее выведенного из родителя — если знаете уровень, задавайте явно.

### Заполнение соседних полей

Обратный случай: одно поле раскладывает выбранный объект по остальным. В корзине так заполняют индекс
и город, не превращая их в отдельные подсказки.

```ts
attachHints(input, { key: 'pk_xxx', fill: { postal: '#zip', city: '#city' } });
```

```html
<input data-hintdata="address" data-fill-postal="#zip" data-fill-city="#city" />
```

Ключи — те же алиасы, что у `fields`. В заполненные поля отправляются `input` и `change`, поэтому
биндинги фреймворков их подхватывают.

Готовая форма «город → улица → дом» плюс раскладка по полям — в
[`examples/linked-fields.html`](examples/linked-fields.html).

### Один клиент на форму

Без `client` каждое поле заводит свой экземпляр `HintData` — со своим кэшем. На форме «откуда/куда»
это значит, что одинаковый запрос уйдёт и будет оплачен дважды. Общий клиент решает и то, и другое:

```ts
import { HintData, attachHints } from '@hintdata/js';

const client = new HintData('pk_xxx');
attachHints(fromInput, { client });
attachHints(toInput, { client });
```

`formatResult` возвращает HTML и вставляется как есть — экранируйте пользовательские данные сами.
Дефолтная разметка экранирование делает.

---

## Виджет: внешний вид

Список рисуется своей разметкой, стили можно переопределить CSS-переменными на `.hd-panel`:

```css
.hd-panel {
  --hd-accent: #e5484d; /* выделение совпадений и активный пункт */
  --hd-bg: #ffffff; /* фон списка */
  --hd-text: #111111; /* основной текст */
  --hd-mut: #6b7280; /* подпись под значением */
  --hd-line: #e5e7eb; /* границы и разделители */
  --hd-rad: 8px; /* скругление */
}
```

Классы для тонкой настройки: `.hd-panel` — контейнер, `.hd-item` — пункт, `.hd-active` — активный,
`.hd-main` — значение, `.hd-sub` — подпись, `.hd-hl` — подсвеченное совпадение, `.hd-ico` — иконка,
`.hd-hint` — шапка, `.hd-empty` — пустое состояние.

---

## Подключение без сборки

Тот же виджет доступен отдельным файлом — npm не нужен:

```html
<script src="https://api.hintdata.ru/widget.js" data-key="pk_xxx"></script>

<input data-hintdata="address" placeholder="Адрес" />
<input data-hintdata="bank" data-fields="bic" placeholder="Банк" />
```

Скрипт сам находит поля с `data-hintdata`, в том числе добавленные позже — в SPA переинициализация
не нужна. Ключ можно задать и глобально: `window.HINTDATA_KEY = 'pk_xxx'`.

Каждая опция имеет парный атрибут:

| Атрибут                                                    | Опция                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `data-hintdata`                                            | `service`                                             |
| `data-key`, `data-url`                                     | `key`, `url`                                          |
| `data-count`, `data-min`, `data-delay`                     | `count`, `minChars`, `delay`                          |
| `data-geo="false"`                                         | `geo`                                                 |
| `data-locations`, `data-from`, `data-to`                   | `locations`, `from`, `to`                             |
| `data-placement`, `data-inline="true"`                     | `placement`, `inline`                                 |
| `data-accent`, `data-radius`, `data-icon`                  | `accent`, `radius`, `icon`                            |
| `data-fields`                                              | `fields` (через запятую: `data-fields="postal,city"`) |
| `data-hint`, `data-empty-text`                             | `hint`, `emptyText`                                   |
| `data-honest`, `data-honest-text`, `data-honest-threshold` | `honest`, `honestText`, `honestThreshold`             |
| `data-parent`                                              | `parent` — CSS-селектор поля-родителя                 |
| `data-fill-postal`, `data-fill-city`, …                    | `fill` — алиас поля → CSS-селектор                    |

Колбэки через атрибуты не задаются — используйте событие `hintdata:select` либо ручную инициализацию:

```js
window.hintData.attachHints(input, { service: 'address', onSelect: console.log });
window.hintData.scan(container); // навесить на поля внутри контейнера
```

---

## Клиент данных `HintData`

Если рисуете свой UI:

```ts
import { HintData } from '@hintdata/js';

const hd = new HintData('pk_xxx', {
  url: 'https://api.hintdata.ru', // необязательно
  timeout: 3000, // мс, по умолчанию 3000
  noCache: false, // выключить кэш ответов в памяти
});
```

### `suggest(service, query, options?)`

Подсказки по строке. Пустой запрос возвращает `[]` без обращения к сети.

```ts
await hd.suggest('address', 'мясницкая 13', {
  count: 5,
  locations: [{ city: 'Москва' }], // жёсткий фильтр
  locationsBoost: [{ kladr_id: '77' }], // мягкое предпочтение
  fromBound: 'street',
  toBound: 'house',
  signal: controller.signal,
});

await hd.suggest('car_model', 'camry');
await hd.suggest('cadastre', '50:21:0010101', { count: 50 });
```

### `findById(service, query, options?)`

Точный объект по идентификатору — ФИАС-коду, кадастровому номеру, БИК. Требует `sk_`-ключа.

```ts
await hd.findById('address', 'a2f0dd77-0a3b-4a5e-9f3a-9c2f1d6bd2a1');
```

### `geolocate(lat, lon, options?)`

Ближайшие адреса к точке.

```ts
await hd.geolocate(55.7558, 37.6173, { radiusMeters: 200, count: 5 });
```

### `iplocate(signal?)`

Город звонящего по IP. `null` — не определён.

```ts
const loc = await hd.iplocate();
```

### `geoBoost()`

Готовое мягкое предпочтение по IP для подстановки в `locationsBoost`. Мемоизировано: сколько бы полей на
странице его ни запросило, обращение к API будет одно.

```ts
const boost = await hd.geoBoost();
await hd.suggest('address', 'ленина 1', { locationsBoost: boost ? [boost] : [] });
```

---

## Обработка ошибок

Клиент не подменяет сбои пустым списком — иначе «ничего не нашли» неотличимо от «ключ не тот».
Любая неудача бросает `HintDataError`:

```ts
import { HintData, HintDataError } from '@hintdata/js';

try {
  await hd.suggest('address', 'мясницкая');
} catch (e) {
  if (e instanceof HintDataError) {
    console.log(e.status, e.code); // 429 rate_limited
  }
}
```

| `code`         | `status`   | Когда                                              |
| -------------- | ---------- | -------------------------------------------------- |
| `unauthorized` | 401, 403   | ключ неверен, отключён или не имеет прав на сервис |
| `rate_limited` | 429        | превышен лимит запросов                            |
| `server_error` | ≥500       | сбой на нашей стороне                              |
| `bad_response` | прочие 4xx | некорректный запрос                                |
| `network`      | 0          | запрос не ушёл: сеть, CORS, DNS                    |
| `aborted`      | 0          | отменён через `signal` или истёк `timeout`         |

Виджет ошибки гасит сам: список просто не открывается — это штатная деградация ввода.

---

## Лимиты

Потолки применяет сервер: значение выше молча уменьшается до максимума, оно не ошибка.

| Параметр                              | Мин | Макс    | Дефолт |
| ------------------------------------- | --- | ------- | ------ |
| `count` — адреса, справочники, `find` | 1   | **20**  | 10     |
| `count` — кадастр                     | 1   | **100** | 20     |
| `radiusMeters` в `geolocate`          | 1   | 1000    | 100    |

Клампы на стороне виджета — `count` 1–20 (дефолт 7), `minChars` 1–10, `delay` 0–2000 мс, `radius` 0–64 px.
Виджет ограничивает `count` двадцатью и для кадастра: сотня строк в выпадающем списке нечитаема. Нужен
полный ответ — берите `HintData.suggest` напрямую, он потолок не занижает.

Клиент кэширует в памяти 50 последних ответов; кэш живёт в экземпляре `HintData` и отключается `noCache`.
Таймаут запроса по умолчанию 3000 мс.

Лимиты запросов в секунду и объём пакета зависят от тарифа — смотрите личный кабинет.

---

## Формат ответа

Ответ нативный, вложенный:

```ts
{
  value: 'г Москва, ул Мясницкая, д 13',
  confidence: 0.94,                        // уверенность 0–1, только адреса
  address:    { region: 'Москва', city: 'Москва', street: 'Мясницкая', house: '13' },
  components: { city: { name: 'Москва', type: 'г', fias_id: '…', kladr_id: '…' } },
  codes:      { postal: '101000', kladr: '77…', oktmo: '45…' },
  geo:        { lat: 55.76, lon: 37.63, precision: 'exact' },
  fias_id:    '…',
}
```

`address` — плоские имена для вывода, `components` — те же уровни с типами и кодами. У неадресных сервисов
поля лежат на верхнем уровне: `bic`, `swift` у банков; `gender`, `name`, `surname` у ФИО.

Состав полей зависит от тарифа. Полное описание — в [документации API](https://hintdata.ru/docs).
Для переезда с DaData есть отдельный совместимый слой с их форматом ответа.

---

## Интеграция с фреймворками

**Vue** — `input` виджет рассылает, `v-model` обновляется сам:

```vue
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { attachHints } from '@hintdata/js';

const el = ref(null);
const address = ref('');
let hints;

onMounted(() => {
  hints = attachHints(el.value, { key: 'pk_xxx' });
});
onUnmounted(() => hints?.destroy());
</script>

<template><input ref="el" v-model="address" /></template>
```

**Angular** — с `ngModel` работает так же; виджет снимайте в `ngOnDestroy`:

```ts
ngAfterViewInit() { this.hints = attachHints(this.el.nativeElement, { key: 'pk_xxx' }); }
ngOnDestroy()     { this.hints?.destroy(); }
```

**React** — контролируемое поле React отслеживает значение сам, поэтому берите его из `onSelect`:

```tsx
const ref = useRef<HTMLInputElement>(null);
const [value, setValue] = useState('');

useEffect(() => {
  const hints = attachHints(ref.current!, { key: 'pk_xxx', onSelect: (s) => setValue(s.value) });
  return () => hints.destroy();
}, []);

return <input ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />;
```

---

## Готовые примеры

- [`examples/script-tag.html`](examples/script-tag.html) — страница с четырьмя полями (адрес с подписью,
  банк, модель авто, срез «только города») без сборки. Откройте в браузере, подставив свой ключ.
- [`examples/npm-module.js`](examples/npm-module.js) — виджет плюс клиент данных из сборки:
  заполнение соседних полей по выбору, гео-приоритет, обработка превышения лимита.

## Сборка

```bash
npm run build      # dist: index.js (ESM), index.cjs (CJS), типы, widget.js (IIFE)
npm run typecheck
npm test
npm run lint
```

Сборка проверена на Node 24.

Лицензия — [MIT](LICENSE).

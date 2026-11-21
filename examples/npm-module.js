/**
 * Программное подключение из сборки: виджет на поле + клиент данных для своего UI.
 *   npm i @hintdata/js
 */
import { attachHints, HintData, HintDataError } from '@hintdata/js';

const KEY = 'pk_xxx';

// 1. Готовый виджет на существующее поле.
const hints = attachHints(document.querySelector('#address'), {
  key: KEY,
  service: 'address',
  count: 7,
  fields: ['postal', 'city'],
  honest: true, // предупреждать, когда конкретный дом сомнителен
  // Разложить выбранный объект по соседним полям.
  fill: { postal: '#postal', city: '#city' },
  // Без этого отозванный ключ и превышенный лимит выглядят как «ничего не нашлось».
  onError: (e) => console.warn('подсказки недоступны:', e.code, e.status),
  // Значение вписали руками, а не выбрали — для доставки это разные вещи.
  onSelectNothing: (value) => console.warn('адрес не подтверждён:', value),
});

// В SPA снимайте виджет вместе с компонентом, иначе список переживёт своё поле.
window.addEventListener('beforeunload', () => hints.destroy());

// 2. Свой интерфейс: клиент возвращает данные, рисуете их сами.
const hd = new HintData(KEY);

async function search(query) {
  try {
    const boost = await hd.geoBoost(); // поднять адреса из региона посетителя
    return await hd.suggest('address', query, {
      count: 5,
      locationsBoost: boost ? [boost] : [],
    });
  } catch (e) {
    if (e instanceof HintDataError && e.code === 'rate_limited') {
      console.warn('превышен лимит запросов, повторим позже');
      return [];
    }
    throw e;
  }
}

export { search };

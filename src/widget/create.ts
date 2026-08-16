/**
 * attachHints — навесить готовый виджет подсказок на поле программно.
 *   import { attachHints } from '@hintdata/js';
 *   const h = attachHints(input, { service: 'address', key: 'pk_…', onSelect: (x) => … });
 *   h.destroy();   // снять
 */
import { HintData } from '../core/client';
import { Widget } from './widget';
import type { WidgetOptions } from './options';

/** Управление живым виджетом. */
export interface HintsInstance {
  /** Заменить часть опций, не пересоздавая виджет и не теряя фокус (связанные поля). */
  setOptions(patch: Partial<WidgetOptions>): void;
  /** Очистить поле, список и отметку о подтверждённом выборе. */
  clear(): void;
  /** Приостановить подсказки, оставив виджет на поле. */
  disable(): void;
  /** Вернуть подсказки после disable(). */
  enable(): void;
  /** Снять обработчики и убрать выпадашку. */
  destroy(): void;
}

/** Виджет на поле — чтобы повторный attachHints не оставил два списка на одном инпуте. */
const ATTACHED = new WeakMap<Element, HintsInstance>();

export function attachHints(
  input: HTMLInputElement | HTMLTextAreaElement,
  options: WidgetOptions = {},
): HintsInstance {
  // Повторный вызов на том же поле (перерисовка в SPA) — переинициализация, а не второй виджет.
  ATTACHED.get(input)?.destroy();

  // Свой клиент на поле — только если не передали общий: у каждого экземпляра отдельный кэш,
  // поэтому на форме с парой адресных полей общий клиент экономит оплаченные запросы.
  const hd = options.client ?? new HintData(options.key ?? '', { url: options.url });
  const widget = new Widget(input, hd, options);
  const instance: HintsInstance = {
    setOptions: (patch) => widget.setOptions(patch),
    clear: () => widget.clear(),
    disable: () => widget.disable(),
    enable: () => widget.enable(),
    destroy: () => {
      ATTACHED.delete(input);
      widget.destroy();
    },
  };
  ATTACHED.set(input, instance);
  return instance;
}

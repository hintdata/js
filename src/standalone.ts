/**
 * Standalone-сборка → widget.js (IIFE, раздаётся с api.hintdata.ru). Тонкая обёртка над attachHints:
 * вешает виджет на поля с [data-hintdata] (data-* → options), подхватывает динамически добавленные (SPA).
 * Для тех, кто без сборки: <script src="…/widget.js" data-key="pk_…"></script> + <input data-hintdata="address">.
 */
import { HintData } from './core/client';
import { attachHints, type HintsInstance } from './widget/create';
import { parseDataAttrs, type WidgetOptions } from './widget/options';

type Field = HTMLInputElement | HTMLTextAreaElement;
const SELECTOR = '[data-hintdata]';

const DEFAULT_BASE = 'https://api.hintdata.ru';

/** Ключ/url из подключившего <script> (data-* или ?key=/?url= в src) либо window.HINTDATA_KEY. */
function scriptConfig(): { key: string; url: string } {
  const cur = (document.currentScript as HTMLScriptElement | null) ?? null;
  let key = cur?.getAttribute('data-key') ?? '';
  let url = cur?.getAttribute('data-url') ?? '';
  if (cur?.src) {
    try {
      const q = new URL(cur.src).searchParams;
      key = key || q.get('key') || '';
      url = url || q.get('url') || '';
    } catch {
      /* ignore */
    }
  }
  const g = (window as unknown as { HINTDATA_KEY?: string }).HINTDATA_KEY;
  return { key: key || g || '', url: url || DEFAULT_BASE };
}

interface HdDemoEl {
  __hdDemo?: WidgetOptions['demoItems'];
}

const SCRIPT = scriptConfig();
// инстансы по полю — чтобы снять виджет (и убрать его панель), когда поле уходит из DOM
const INSTANCES = new WeakMap<Element, HintsInstance>();

function attach(el: Field): void {
  if (INSTANCES.has(el)) return;
  const opts = parseDataAttrs(el);
  // data-key/data-url на поле переопределяют подключение скрипта
  opts.key = opts.key || SCRIPT.key;
  opts.url = opts.url || SCRIPT.url;
  // демо-данные превью кладут недокументированным свойством __hdDemo (бандл остаётся чистым)
  const demo = (el as unknown as HdDemoEl).__hdDemo;
  if (Array.isArray(demo)) opts.demoItems = demo;
  INSTANCES.set(el, attachHints(el, opts));
}

function attachAll(root: ParentNode = document): void {
  root.querySelectorAll<Field>(SELECTOR).forEach(attach);
}

/** Поле изъято из DOM → снять виджет: иначе плавающая выпадашка (на body) осиротеет (SPA/смена вкладки). */
function detach(el: Field): void {
  if (el.isConnected) return; // перемещение, не удаление
  INSTANCES.get(el)?.destroy();
  INSTANCES.delete(el);
}

function boot(): void {
  attachAll();
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.removedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (el.matches(SELECTOR)) detach(el as Field);
        el.querySelectorAll?.<Field>(SELECTOR).forEach(detach);
      });
    }
    attachAll();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// ручная инициализация: window.hintData.scan(root) (по data-*) или .attachHints(input, options).
// HintData — чтобы и без сборщика можно было завести один клиент на форму (общий кэш).
(window as unknown as { hintData?: unknown }).hintData = {
  scan: attachAll,
  attachHints,
  HintData,
};

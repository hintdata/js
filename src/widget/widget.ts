/**
 * Widget — DOM-слой подсказок поверх ядра HintData. Привязывается к одному <input>/<textarea>,
 * рисует выпадашку, обрабатывает клавиатуру/выбор/drill-down. Конфиг — WidgetOptions (программно
 * через attachHints либо из data-* через parseDataAttrs); хранится сырым, чтобы setOptions мог
 * накладывать патч. Сеть/кэш/гео — в HintData.
 */
import { HintData, HintDataError } from '../core/client';
import { drillStep, formatSub } from '../core/address';
import { GEO_SERVICES } from '../core/client';
import type { LocationConstraint, Service, Suggestion, SuggestOptions } from '../core/types';
import { resolveOptions, type ResolvedOptions, type WidgetOptions } from './options';
import { ICON, ICONS, injectStyles } from './styles';

// Все pk-доступные suggest-домены шлюза (RouteCatalog.SuggestDomains + отдельный роут cadastre).
// Виджет generic — рисует value+саб; drill-down/гео живут только под address (гейты по domain() ниже).
// Права решает шлюз: если ключ не проходит, клиент увидит ошибку API, а не чужую выдачу — поэтому
// подменять сервис адресными подсказками здесь нельзя.
const SUPPORTED: Service[] = [
  'address',
  'cadastre',
  'fio',
  'party',
  'bank',
  'email',
  'country',
  'currency',
  'okved',
  'okpd2',
  'oktmo',
  'metro',
  'fms_unit',
  'fns_unit',
  'car_brand',
  'car_model',
  'mktu',
  'medical_position',
  'court',
  'customs',
  'okpdtr_profession',
  'okpdtr_position',
  'postal_office',
];

// Терпим к отсутствию значения: битая строка сервера без value/sub → рендерим пусто, а не бросаем
// TypeError (иначе весь дропдаун падает необработанным исключением).
function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

/** Счётчик виджетов на странице — из него уникальные id для aria-связок. */
let seq = 0;

export class Widget {
  private readonly el: HTMLInputElement | HTMLTextAreaElement;
  private readonly hd: HintData;
  private o: ResolvedOptions;
  private readonly doc: Document;

  private panel: HTMLDivElement | null = null;
  private items: Suggestion[] = [];
  private active = -1;
  private boost: LocationConstraint | null = null;
  private located = false;
  private clampWarned = false;
  /** Идёт рассылка собственных событий поля (см. select) — свой же input игнорируем. */
  private emitting = false;
  private dead = false;
  private off = false;
  private typing: ReturnType<typeof setTimeout> | undefined;
  /** Значение, реально выбранное из подсказок — по нему отличаем подтверждённый объект от ручного ввода. */
  private picked: string | null = null;
  /** Опции как их передал интегратор: setOptions накладывает патч на них, а не на разрешённые. */
  private raw: WidgetOptions;
  /** Идентификаторы для aria-связок: у каждого виджета на странице свои. */
  private readonly ids: { panel: string; opt: string };
  /** Отписка от поля-родителя (опция parent). */
  private parentBound: (() => void) | null = null;
  private aborter: AbortController | null = null;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly winListeners: Array<[string, EventListener, AddEventListenerOptions]> = [];

  constructor(el: HTMLInputElement | HTMLTextAreaElement, hd: HintData, options: WidgetOptions) {
    this.el = el;
    this.hd = hd;
    this.raw = options;
    this.o = resolveOptions(options);
    this.doc = el.ownerDocument;

    el.setAttribute('autocomplete', 'off');

    // Паттерн combobox: скринридер иначе не узнаёт, что список открылся и какой пункт активен —
    // визуальной подсветки он не видит. Фокус остаётся в поле, активный пункт указываем ссылкой.
    const n = ++seq;
    this.ids = { panel: `hd-panel-${n}`, opt: `hd-opt-${n}-` };
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', 'false');
    el.setAttribute('aria-controls', this.ids.panel);

    // открытая панель следует за полем при скролле/ресайзе (кроме flow — та в потоке сама).
    // capture на scroll — ловим и прокрутку вложенных контейнеров; скролл самой панели не трогаем.
    if (this.o.placement !== 'flow') {
      const win = this.doc.defaultView ?? window;
      // Позиционируем не чаще кадра: place() дважды читает offsetHeight, а это принудительный
      // пересчёт макета — на каждое событие прокрутки он бы дёргал страницу клиента.
      let frame = 0;
      const reposition: EventListener = (e) => {
        if (!this.panel || this.panel.style.display === 'none') return;
        if (e.target instanceof Node && this.panel.contains(e.target)) return;
        if (frame) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          if (this.panel && this.panel.style.display !== 'none') this.place();
        });
      };
      this.onWin(win, 'scroll', reposition, { capture: true, passive: true });
      this.onWin(win, 'resize', reposition, { passive: true });
    }

    // demo: тот же реальный рендер, но без сети/ключа. Данные — из options.demoItems (превью кладёт образцы).
    if (this.o.demo) {
      this.items = this.o.demoEmpty || !this.o.demoItems ? [] : this.o.demoItems;
      queueMicrotask(() => this.render(''));
      return;
    }

    // только пользовательский ввод: свой input из select() иначе перебил бы drill-down новым запросом
    this.on('input', () => {
      if (this.emitting) return;
      // Правка после выбора рвёт подтверждение — на это событие завязаны дочерние поля.
      if (null !== this.picked && this.el.value !== this.picked) {
        this.picked = null;
        this.el.dispatchEvent(new CustomEvent('hintdata:unselect', { bubbles: true }));
      }
      this.schedule();
    });
    this.on('focus', () => this.onFocus());
    // клик по уже сфокусированному полю с текстом — снова показать подсказки
    this.on('click', () => this.reopen());
    this.on('keydown', (e) => this.onKey(e as KeyboardEvent));
    this.on('blur', () => {
      setTimeout(() => this.close(), 150);
      this.reportUnconfirmed();
    });

    this.bindParent();

    // Гео-буст грузим НА ИНИЦИАЛИЗАЦИИ (не дожидаясь фокуса) — готов до первого ввода, без гонки с первым
    // suggest. locate() самогейтится (geo+address+!located), а geoBoost мемоизирован → N инпутов = 1 iplocate.
    void this.locate();
  }

  private on(type: string, fn: EventListener): void {
    this.el.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  private onWin(win: Window, type: string, fn: EventListener, opts: AddEventListenerOptions): void {
    win.addEventListener(type, fn, opts);
    this.winListeners.push([type, fn, opts]);
  }

  private resolve(t: string | HTMLElement | undefined | null): HTMLElement | null {
    if (!t) return null;
    return 'string' === typeof t ? this.doc.querySelector<HTMLElement>(t) : t;
  }

  /**
   * Связать с полем-родителем: пока в нём не выбран объект, это поле выключено; после выбора
   * якоримся на его `fias_id` и переходим на уровень детей. Уровень и якорь считает drillStep —
   * та же логика, по которой виджет углубляется внутри одного поля.
   */
  private bindParent(): void {
    const parent = this.resolve(this.o.parent);
    if (!parent) return;

    this.disable();
    const onPick = (e: Event): void => {
      const s = (e as CustomEvent<{ suggestion: Suggestion }>).detail?.suggestion;
      const step = s && drillStep(s);
      if (!step) return;
      this.clear();
      // Явно заданный уровень интегратора не перебиваем — он знает, что хочет искать.
      const patch: Partial<WidgetOptions> = { locations: { [step.field]: step.fias } };
      if (!this.raw.from) patch.from = step.bound;
      this.setOptions(patch);
      this.enable();
    };
    const onDrop = (): void => {
      this.clear();
      this.disable();
    };

    parent.addEventListener('hintdata:select', onPick);
    parent.addEventListener('hintdata:unselect', onDrop);
    this.parentBound = () => {
      parent.removeEventListener('hintdata:select', onPick);
      parent.removeEventListener('hintdata:unselect', onDrop);
    };
  }

  /** Разложить выбранную подсказку по соседним полям (опция fill). */
  private spread(s: Suggestion): void {
    if (!this.o.fill) return;
    const isAddress = this.o.service === 'address';
    for (const [alias, target] of Object.entries(this.o.fill)) {
      const el = this.resolve(target);
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) continue;
      el.value = formatSub(s, [alias], isAddress);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /** Отложенный запрос по вводу. Паузу берём из текущих опций — её мог сменить setOptions. */
  private schedule(): void {
    if (this.typing) clearTimeout(this.typing);
    this.typing = setTimeout(() => void this.onInput(), this.o.delay);
  }

  /**
   * Заменить часть опций на живом виджете. Нужно связанным полям: выбрали город — второе поле
   * ограничиваем им через `locations`, не пересоздавая виджет и не теряя фокус.
   */
  setOptions(patch: Partial<WidgetOptions>): void {
    this.o = resolveOptions({ ...this.raw, ...patch });
    this.raw = { ...this.raw, ...patch };
    // сменился сервис или территория — прежний список уже не про то
    this.close();
    this.items = [];
    this.active = -1;
    // Родителя переподключаем только когда его правда меняли: иначе любой патч гасил бы поле,
    // потому что новая связка ждёт выбора в родителе.
    if ('parent' in patch) {
      this.parentBound?.();
      this.parentBound = null;
      if (this.o.parent) this.bindParent();
      else this.enable(); // родителя сняли — поле снова самостоятельное
    }
  }

  /** Очистить поле, список и отметку о подтверждённом выборе. */
  clear(): void {
    this.el.value = '';
    this.items = [];
    this.active = -1;
    this.picked = null;
    this.close();
  }

  /** Временно выключить подсказки, не снимая виджет (поле только для чтения, шаг мастера). */
  disable(): void {
    this.off = true;
    this.close();
  }

  enable(): void {
    this.off = false;
  }

  /** Снять обработчики и убрать выпадашку (для SPA / повторной инициализации). */
  destroy(): void {
    this.dead = true;
    this.parentBound?.();
    this.parentBound = null;
    if (this.typing) clearTimeout(this.typing);
    this.aborter?.abort(); // запрос в полёте иначе дорисовал бы панель заново
    for (const [type, fn] of this.listeners) this.el.removeEventListener(type, fn);
    this.listeners.length = 0;
    const win = this.doc.defaultView ?? window;
    for (const [type, fn, opts] of this.winListeners) win.removeEventListener(type, fn, opts);
    this.winListeners.length = 0;
    this.panel?.remove();
    this.panel = null;
  }

  /**
   * Домен запроса: неподдержанный сервис клампим к address — но НЕ молча. Тихая подмена выглядит как
   * рабочий виджет, который просто «неправильно ищет»: разработчик ставит cadastre, получает адресные
   * подсказки и не понимает почему. Предупреждаем один раз на инстанс, чтобы не залить консоль.
   */
  private domain(): Service {
    if ((SUPPORTED as string[]).includes(this.o.service)) return this.o.service as Service;
    if (!this.clampWarned) {
      this.clampWarned = true;
      console.warn(
        `[hintdata] service="${this.o.service}" не поддержан виджетом → используем "address". ` +
          'Поддержаны: ' +
          SUPPORTED.join(', '),
      );
    }
    return 'address';
  }

  /** Опции suggest из текущего конфига. extra переопределяет дефолты; noBoost — для drill-down. */
  private opts(extra: Partial<SuggestOptions> = {}, noBoost = false): SuggestOptions {
    const o: SuggestOptions = { count: this.o.count };
    // Уровни адресной иерархии — только у адреса; территория — у всех GEO_SERVICES.
    if (this.domain() === 'address') {
      if (this.o.from) o.fromBound = this.o.from as SuggestOptions['fromBound'];
      if (this.o.to) o.toBound = this.o.to as SuggestOptions['toBound'];
    }
    if (GEO_SERVICES.has(this.domain())) {
      if (this.o.locations) o.locations = this.o.locations;
      if (this.boost && !noBoost) o.locationsBoost = [this.boost];
    }
    return { ...o, ...extra };
  }

  private onFocus(): void {
    this.reopen(); // в поле уже есть текст → сразу показать подсказки
    void this.locate();
  }

  /** Поле с текстом и закрытой выпадашкой → перезапросить и показать (фокус/клик). */
  private reopen(): void {
    if (this.o.demo || this.off) return;
    if (this.el.value.trim().length < this.o.minChars) return;
    if (this.panel && this.panel.style.display !== 'none') return; // уже открыта
    void this.onInput();
  }

  private async locate(): Promise<void> {
    // Гео-приоритет нужен там, где у выдачи есть территория: адрес и организации. Список общий с
    // клиентом (GEO_SERVICES) — раздельные проверки уже однажды разошлись и выключили гео у party.
    if (!this.o.geo || this.located || !GEO_SERVICES.has(this.domain())) return;
    this.located = true;
    this.boost = await this.hd.geoBoost();
  }

  private async onInput(): Promise<void> {
    if (this.off) return;
    const q = this.el.value.trim();
    if (q.length < this.o.minChars) {
      this.close();
      return;
    }
    const items = await this.query(q, this.opts());
    if (items === null) return; // отменён более новым запросом
    this.items = items;
    this.o.onSearchComplete?.(items);
    this.active = -1;
    this.render(q);
  }

  /** Запрос с отменой предыдущего (гонка ввода). null — этот запрос устарел. */
  private async query(q: string, opts: SuggestOptions): Promise<Suggestion[] | null> {
    this.aborter?.abort();
    const ctrl = new AbortController();
    this.aborter = ctrl;
    try {
      const items = await this.hd.suggest(this.domain(), q, { ...opts, signal: ctrl.signal });
      if (ctrl.signal.aborted || this.aborter !== ctrl) return null;
      return items;
    } catch (e) {
      if (ctrl.signal.aborted || this.aborter !== ctrl) return null; // отменён более новым — игнор
      this.close(); // запрос упал (API/сеть) — ничего не показываем
      if (e instanceof HintDataError) {
        // DOM-событие — та же ошибка для атрибутного режима (без JS колбэков onError недостижим)
        this.el.dispatchEvent(
          new CustomEvent('hintdata:error', {
            bubbles: true,
            detail: { code: e.code, status: e.status, error: e },
          }),
        );
        this.o.onError?.(e);
      }
      return null;
    }
  }

  private render(q: string): void {
    // элемент могли пересоздать/убрать (SPA, превью), а debounce-таймер дожил — сирот не рисуем
    if (this.dead || !this.el.isConnected) return;
    injectStyles(this.doc);
    if (!this.panel) {
      this.panel = this.doc.createElement('div');
      this.panel.className = 'hd-panel';
      this.panel.id = this.ids.panel;
      this.panel.setAttribute('role', 'listbox');
      // вид задаёт хост через CSS-переменные на .hd-panel; inline-override — только явные accent/radius
      // (иначе CSS-дефолт из widget.css, переопределяемый своим CSS через .hd-panel{--hd-accent}).
      if (this.o.accent) this.panel.style.setProperty('--hd-accent', this.o.accent);
      if (this.o.radius) this.panel.style.setProperty('--hd-rad', this.o.radius);
      // pointerdown (не click) — успеваем до blur инпута и одинаково ловим мышь, тап и стилус.
      // На тапе click приходит позже закрытия по blur, поэтому выбор бы терялся.
      const down = 'onpointerdown' in this.panel ? 'pointerdown' : 'mousedown';
      this.panel.addEventListener(down, (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.hd-item');
        if (btn) {
          e.preventDefault();
          this.select(parseInt(btn.dataset.i || '-1', 10));
        }
      });
      // inline/flow — выпадашка в контейнере поля (живёт и умирает вместе с ним); иначе — на body.
      // В inline-режиме панель absolute поверх контента → контейнеру нужен positioning context.
      const flow = 'flow' === this.o.placement;
      if (this.o.inline || flow) {
        this.panel.classList.add('hd-inline');
        const host = this.el.parentElement ?? this.doc.body;
        if (flow) {
          this.panel.classList.add('hd-flow');
        } else if ('static' === (this.doc.defaultView ?? window).getComputedStyle(host).position) {
          host.style.position = 'relative';
        }
        host.appendChild(this.panel);
      } else {
        this.doc.body.appendChild(this.panel);
      }
    }
    if (!this.items.length) {
      // пустое состояние — opt-in: рисуем только если задан emptyText, иначе прячем (ничего не показываем)
      if (this.o.emptyText) {
        this.panel.innerHTML = `<div class="hd-empty">${esc(this.o.emptyText)}</div>`;
        this.show();
      } else {
        this.close();
      }
      return;
    }
    const ico = this.o.icon
      ? `<span class="hd-ico">${typeof this.o.icon === 'string' ? this.o.icon : ICONS[this.o.service] || ICON}</span>`
      : '';
    const items = this.items
      .map((s, i) => {
        const active = i === this.active ? ' hd-active' : '';
        const inner = this.o.formatResult ? this.o.formatResult(s, q) : this.defaultItem(s, q);
        // tabindex=-1: пункты нельзя ловить Tab'ом — фокус остаётся в поле, список ведём
        // через aria-activedescendant (паттерн combobox).
        return (
          `<button type="button" class="hd-item${active}" data-i="${i}" tabindex="-1"` +
          ` id="${this.ids.opt}${i}" role="option" aria-selected="${i === this.active}">${ico}${inner}</button>`
        );
      })
      .join('');
    // honest-unknown: «адрес не найден» ТОЛЬКО для конкретного адреса (есть номер дома в конце запроса) при
    // низкой уверенности. На typeahead/общем запросе («листвянка» — много валидных, P низкий) НЕ показываем.
    const top = this.items[0];
    const specific = /(?:^|\s)\d[\d/\-а-яё]*\s*$/i.test(q);
    const low =
      this.o.honest &&
      specific &&
      typeof top?.confidence === 'number' &&
      top.confidence < this.o.honestThreshold;
    const headText = low ? this.o.honestText : this.o.hint;
    const head = headText ? `<div class="hd-hint${low ? ' hd-low' : ''}">${esc(headText)}</div>` : '';
    this.panel.innerHTML = head + items;
    this.show();
  }

  /** Дефолтная разметка пункта: главная строка (с подсветкой) + саб-строка из полей. */
  private defaultItem(s: Suggestion, q: string): string {
    // Форма данных — от СЫРОГО сервиса, не от клампа domain(): у неадресных сервисов поля плоские
    // (s[field]), и ADDRESS_FIELD-маппинг дал бы пустой саб. Кламп меняет только КУДА уходит запрос.
    const sub = formatSub(s, this.o.fields, this.o.service === 'address');
    return `<span class="hd-txt"><span class="hd-main">${this.hl(this.labelOf(s), q)}</span>${sub ? `<span class="hd-sub">${esc(sub)}</span>` : ''}</span>`;
  }

  /** Главная строка пункта (опция label, по умолчанию = selected): алиас поля, пустой алиас — полный value. */
  private labelOf(s: Suggestion): string {
    if (!this.o.label || this.o.label === 'value') return s.value;
    return formatSub(s, [this.o.label], this.o.service === 'address') || s.value;
  }

  // показать панель: flow — статично в потоке, остальные — спозиционировать у поля (с флипом)
  private show(): void {
    if (!this.panel) return;
    this.el.setAttribute('aria-expanded', 'true');
    if ('flow' === this.o.placement) {
      this.panel.style.display = 'block';
      return;
    }
    this.place();
  }

  /** Отметить активный пункт: класс для глаза, aria-* для скринридера. Без перерисовки списка. */
  private markActive(): void {
    if (!this.panel) return;
    const items = this.panel.querySelectorAll<HTMLElement>('.hd-item');
    items.forEach((el, i) => {
      const on = i === this.active;
      el.classList.toggle('hd-active', on);
      el.setAttribute('aria-selected', String(on));
    });
    const cur = this.active >= 0 ? `${this.ids.opt}${this.active}` : null;
    if (cur) this.el.setAttribute('aria-activedescendant', cur);
    else this.el.removeAttribute('aria-activedescendant');
  }

  // подсветка совпавших слов запроса в значении
  private hl(value: string, q: string): string {
    const safe = esc(value);
    const words = q
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return safe;
    try {
      return safe.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<i class="hd-hl">$1</i>');
    } catch {
      return safe;
    }
  }

  /**
   * Спозиционировать панель у поля поверх контента. Сторона: top/bottom — как сказали; auto — вниз,
   * а вверх только если вниз целиком не влезает И сверху места больше. Высота клампится к доступному
   * месту во вьюпорте (низ ≥96px — огрызок у края не показываем). Координаты — от offsetParent:
   * floating-панель лежит на body (документные scrollX/scrollY), inline — в спозиционированном хосте.
   */
  private place(): void {
    if (!this.panel) return;
    const p = this.panel;
    const win = this.doc.defaultView ?? window;
    const r = this.el.getBoundingClientRect();
    const gap = 4; // зазор поле↔панель
    const edge = 8; // не прилипать к краю вьюпорта
    p.style.display = 'block';
    p.style.maxHeight = ''; // сброс прошлого клампа → натуральная высота (CSS-потолок остаётся)
    const want = p.offsetHeight;
    const below = win.innerHeight - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    const side: 'bottom' | 'top' =
      'top' === this.o.placement
        ? 'top'
        : 'bottom' === this.o.placement
          ? 'bottom'
          : want <= below || below >= above
            ? 'bottom'
            : 'top';
    const avail = 'bottom' === side ? below : above;
    if (want > avail) p.style.maxHeight = `${Math.max(96, avail)}px`;
    const h = p.offsetHeight;

    let dx = win.scrollX;
    let dy = win.scrollY;
    const op = p.offsetParent;
    if (op instanceof HTMLElement && op !== this.doc.body && op !== this.doc.documentElement) {
      const or = op.getBoundingClientRect();
      dx = -or.left - op.clientLeft;
      dy = -or.top - op.clientTop;
    }
    p.style.left = `${r.left + dx}px`;
    p.style.top = `${('bottom' === side ? r.bottom + gap : r.top - h - gap) + dy}px`;
    p.style.width = `${r.width}px`;
  }

  /** Ушли из поля со значением, которого нет среди выбранных — объект не подтверждён. */
  private reportUnconfirmed(): void {
    if (!this.o.onSelectNothing) return;
    const v = this.el.value.trim();
    if (v && v !== this.picked) this.o.onSelectNothing(v);
  }

  private select(i: number): void {
    const s = this.items[i];
    if (!s) return;
    this.el.value = this.o.formatSelected ? this.o.formatSelected(s) : this.selectedValue(s);
    this.picked = this.el.value;
    this.emitting = true;
    try {
      this.el.dispatchEvent(
        new CustomEvent('hintdata:select', { bubbles: true, detail: { value: s.value, suggestion: s } }),
      );
      // input обязателен: на нём держатся биндинги (Vue v-model, Angular ngModel, React onChange) —
      // без него значение попадает в DOM, но не в состояние приложения.
      this.el.dispatchEvent(new Event('input', { bubbles: true }));
      this.el.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      this.emitting = false;
    }
    this.spread(s);
    this.o.onSelect?.(s);
    // После выбора сразу подсказываем продолжение вглубь (город → улица → дом → квартира).
    void this.drillDown(s);
  }

  /** Значение для поля при выборе (опция selected): алиас без formatSelected; пустой алиас — полный value. */
  private selectedValue(s: Suggestion): string {
    if (!this.o.selected) return s.value;
    return formatSub(s, [this.o.selected], this.o.service === 'address') || s.value;
  }

  private async drillDown(s: Suggestion): Promise<void> {
    // только address; demo / фикс-уровень (to задан) — не углубляемся
    if (this.o.demo || this.domain() !== 'address' || this.o.to) {
      this.close();
      return;
    }
    const step = drillStep(s);
    if (!step) {
      this.close();
      return;
    }
    // Якорим запрос на выбранный объект (его *_fias_id), иначе текст вроде «парк Пискарёвский»
    // под from_bound цепляет чужие «…парк» объекты.
    const raw = await this.query(
      s.value,
      this.opts({ fromBound: step.bound, locations: [{ [step.field]: step.fias }] }, true),
    );
    if (raw === null) return;
    const items = raw.filter((it) => it.fias_id !== s.fias_id); // не показываем сам выбранный объект среди детей
    if (!items.length) {
      this.close();
      return;
    }
    this.items = items;
    this.active = -1;
    this.render('');
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.panel || this.panel.style.display === 'none') return;
    // Escape закрывает и пустое состояние (emptyText): панель видна, а списка нет.
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    if (!this.items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.active = (this.active + 1) % this.items.length;
      this.markActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = (this.active - 1 + this.items.length) % this.items.length;
      this.markActive();
    } else if (e.key === 'Enter') {
      if (this.active >= 0) {
        e.preventDefault();
        this.select(this.active);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  private close(): void {
    if (this.panel) this.panel.style.display = 'none';
    this.el.setAttribute('aria-expanded', 'false');
    this.el.removeAttribute('aria-activedescendant');
  }
}

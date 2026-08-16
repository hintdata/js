/** Иконка + инжект стилей выпадашки. CSS — из widget.css (впекается в бандл при сборке). */
import css from './widget.css';

const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"';

/** Лупа — fallback для неизвестного домена. */
export const ICON = `<svg ${S}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

const TAG = `<svg ${S}><path d="M3 11V4h7l11 11-7 7L3 11Z"/><circle cx="7" cy="8" r="1.5"/></svg>`;
const GOV = `<svg ${S}><path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-5h4v5"/></svg>`;
const ORG = `<svg ${S}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

/** Доменные иконки результата по service. Fallback — ICON (лупа); кастомный data-icon="<svg…>" переопределяет. */
export const ICONS: Record<string, string> = {
  address: `<svg ${S}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  cadastre: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`,
  bank: `<svg ${S}><path d="M4 10h16M5 21h14M7 10v11M11 10v11M13 10v11M17 10v11M12 3 4 7v3h16V7l-8-4Z"/></svg>`,
  fio: `<svg ${S}><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/></svg>`,
  email: `<svg ${S}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>`,
  country: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>`,
  currency: `<svg ${S}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  metro: `<svg ${S}><rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 12h14M8 20l-2 2M16 20l2 2"/></svg>`,
  car_brand: `<svg ${S}><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5M3 13h18v4H3v-4M6 17v2M18 17v2"/></svg>`,
  okved: TAG,
  okpd2: TAG,
  oktmo: TAG,
  fns_unit: GOV,
  fms_unit: GOV,
  party: ORG,
  company: ORG,
};

let injected = false;

export function injectStyles(doc: Document): void {
  if (injected) return;
  injected = true;
  const el = doc.createElement('style');
  el.id = 'hd-widget-styles';
  el.textContent = css;
  doc.head.appendChild(el);
}

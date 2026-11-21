/**
 * @hintdata/js — публичный пакет подсказок hintdata.ru. Из одного пакета (как у DaData):
 *  • HintData — data-клиент (свой UI);
 *  • attachHints(input, options) — готовый виджет с кастомизацией (колбэки onSelect/formatResult…).
 * Доставка: npm (`npm i @hintdata/js`) ИЛИ `<script src="https://api.hintdata.ru/widget.js">` (auto-attach
 * по data-*, та же сборка). Подробнее — README.
 */
export { HintData, HintDataError } from './core/client';
export { ADDRESS_FIELD, nextBound, formatSub, boostFromLocation } from './core/address';
export type {
  Service,
  Suggestion,
  SuggestOptions,
  LocationConstraint,
  AddressBound,
  FioPart,
  HintDataConfig,
} from './core/types';

export { attachHints, type HintsInstance } from './widget/create';
export type { WidgetOptions, WidgetCallbacks } from './widget/options';

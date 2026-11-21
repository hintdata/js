/** Публичная поверхность ядра (его же реэкспортит SDK-точка sdk.ts). */
export { HintData, GEO_SERVICES } from './client.js';
export { ADDRESS_FIELD, nextBound, formatSub, boostFromLocation } from './address.js';
export type {
  Service,
  Suggestion,
  SuggestOptions,
  LocationConstraint,
  AddressBound,
  HintDataConfig,
} from './types.js';

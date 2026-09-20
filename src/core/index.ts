/** Публичная поверхность ядра (его же реэкспортит SDK-точка sdk.ts). */
export { HintData, GEO_SERVICES } from './client';
export { ADDRESS_FIELD, nextBound, formatSub, boostFromLocation } from './address';
export type {
  Service,
  Suggestion,
  SuggestOptions,
  LocationConstraint,
  AddressBound,
  HintDataConfig,
} from './types';

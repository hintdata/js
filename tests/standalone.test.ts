/**
 * standalone.test.ts — window.hintData.attachHints должен наследовать ключ/url скрипта, как автоскан
 * (src/standalone.ts: withScriptDefaults). document.currentScript в jsdom всегда null (модуль грузится
 * не через реальный <script>), поэтому здесь проверяется только фолбэк через window.HINTDATA_KEY.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ключ ДО импорта модуля: читается лениво (в момент attach), поэтому подхватывается так же, как
// и ключ, выставленный уже после загрузки скрипта (см. кейсы ниже) — сравни со сценарием из README.
(window as unknown as { HINTDATA_KEY?: string }).HINTDATA_KEY = 'pk_test';

import '../src/standalone';

interface HintsInstance {
  destroy(): void;
}
interface HintDataGlobal {
  attachHints(input: HTMLInputElement, options?: Record<string, unknown>): HintsInstance;
}
const hintData = (): HintDataGlobal => (window as unknown as { hintData: HintDataGlobal }).hintData;

let fetchMock: ReturnType<typeof vi.fn>;
let input: HTMLInputElement;
let hints: HintsInstance | undefined;

const reply = () => ({ ok: true, status: 200, json: async () => ({ suggestions: [] }) }) as Response;

async function type(text: string, wait = 150): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(wait);
  await Promise.resolve();
  await Promise.resolve();
}

/** fetch зовётся с headers как plain-объектом — ищем authorization регистронезависимо. */
function authHeader(i = 0): string | undefined {
  const headers = (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;
  return Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue(reply());
  vi.stubGlobal('fetch', fetchMock);
  input = document.createElement('input');
  document.body.appendChild(input);
});

afterEach(() => {
  hints?.destroy();
  hints = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('window.hintData.attachHints — дефолты ключа со скрипта (window.HINTDATA_KEY)', () => {
  it('ключ, выставленный до импорта модуля, уходит в Authorization', async () => {
    hints = hintData().attachHints(input, { geo: false });
    await type('мясницкая');
    expect(authHeader()).toBe('Token pk_test');
  });

  it('ключ, выставленный после импорта и до attach, тоже подхватывается', async () => {
    (window as unknown as { HINTDATA_KEY?: string }).HINTDATA_KEY = 'pk_later';
    hints = hintData().attachHints(input, { geo: false });
    await type('мясницкая');
    expect(authHeader()).toBe('Token pk_later');
  });

  it('явный key в опциях сильнее глобального', async () => {
    (window as unknown as { HINTDATA_KEY?: string }).HINTDATA_KEY = 'pk_global';
    hints = hintData().attachHints(input, { geo: false, key: 'pk_explicit' });
    await type('мясницкая');
    expect(authHeader()).toBe('Token pk_explicit');
  });
});

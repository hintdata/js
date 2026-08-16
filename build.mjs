/**
 * Сборка пакета @hintdata/js — ДВА артефакта из одного кода:
 *  • npm: dist/index.js (ESM) + index.cjs (CJS) + типы (tsc)  ← `npm i @hintdata/js`
 *  • dist/widget.js (IIFE, self-contained, min CSS впечён) ← подключение тегом <script>
 *   node build.mjs            # prod
 *   node build.mjs --dev      # widget.js без минификации
 */
import { build, transform } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');

// Чистим dist: переименованный или удалённый файл иначе доживёт до публикации (files берёт весь dist).
rmSync('dist', { recursive: true, force: true });

/** .css импорт → минифицированная строка (впекается в widget.js, отдельный <link> не нужен). */
const inlineMinCss = {
  name: 'inline-min-css',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, async (args) => {
      const raw = readFileSync(args.path, 'utf8');
      const { code } = await transform(raw, { loader: 'css', minify: true });
      return { contents: `export default ${JSON.stringify(code)}`, loader: 'js' };
    });
  },
};

// charset:'utf8' — не экранировать кириллицу в \uXXXX (дефолт esbuild = ascii); файл отдаём сами как application/javascript.
const common = { bundle: true, target: 'es2018', charset: 'utf8', logLevel: 'info' };

// npm-артефакт (ESM + CJS). Стили виджета впекаются и сюда: attachHints тянет styles.ts, поэтому
// подключившему не нужен отдельный import CSS. Не минифицируем — это делает сборщик потребителя.
const npmOpts = { ...common, entryPoints: ['src/index.ts'], sourcemap: true, plugins: [inlineMinCss] };
await build({ ...npmOpts, format: 'esm', outfile: 'dist/index.js' });
await build({ ...npmOpts, format: 'cjs', outfile: 'dist/index.cjs' });

// widget.js — standalone IIFE для <script> (auto-attach + впечённый CSS)
await build({
  ...common,
  entryPoints: ['src/standalone.ts'],
  format: 'iife',
  minify: !dev,
  outfile: 'dist/widget.js',
  plugins: [inlineMinCss],
});

console.log(dev ? 'built (dev widget)' : 'built: npm (index.js/cjs) + dist/widget.js');

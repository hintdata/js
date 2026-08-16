/** CSS-импорт как строка (esbuild loader:.css=text) — для впекания стилей виджета в бандл. */
declare module '*.css' {
  const css: string;
  export default css;
}

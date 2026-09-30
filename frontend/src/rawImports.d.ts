/** Vite's `?raw` suffix imports a file's text as a string (used for docs/line-csv-template.csv). */
declare module "*?raw" {
  const content: string;
  export default content;
}

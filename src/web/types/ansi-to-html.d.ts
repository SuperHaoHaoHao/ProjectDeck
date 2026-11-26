declare module 'ansi-to-html' {
  interface ConvertOptions {
    fg?: string;
    bg?: string;
    newline?: boolean;
    escapeXML?: boolean;
    stream?: boolean;
    colors?: string[] | Record<string, string>;
  }

  class Convert {
    constructor(options?: ConvertOptions);
    toHtml(input: string): string;
  }

  export default Convert;
}

declare module 'xml-beautify' {
  interface BeautifyOptions {
    indent?: string;
    useSelfClosingElement?: boolean;
  }

  interface XmlBeautifyConstructorOptions {
    parser?: any;
  }

  class XmlBeautify {
    constructor(options?: XmlBeautifyConstructorOptions);
    beautify(xml: string, options?: BeautifyOptions): string;
  }

  export = XmlBeautify;
}

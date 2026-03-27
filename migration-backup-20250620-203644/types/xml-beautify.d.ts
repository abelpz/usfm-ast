declare module 'xml-beautify' {
  interface XmlBeautifyOptions {
    indent?: string;
    indentSize?: number;
    useSelfClosingElement?: boolean;
    splitXmlnsOnFormat?: boolean;
  }

  interface XmlBeautifyConstructor {
    parser: typeof DOMParser;
  }

  export default class XmlBeautify {
    constructor(options: XmlBeautifyConstructor);
    beautify(xml: string, options?: XmlBeautifyOptions): string;
  }
}
import path from "path";
import fs from "fs";
import { USFMParser } from "..";
import { HTMLVisitor, USXVisitor, USJVisitor, TextVisitor } from "../..";

describe("USFMParser - Visitors", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test("converts USFM to different formats", () => {
    const input = String.raw`\p This is a paragraph with \bd bold\bd* text and a \f + \fr 1.1: \ft Note text.\f* footnote.`;
    parser.load(input).parse();

    // Convert to HTML
    const htmlVisitor = new HTMLVisitor();
    const html = parser.visit(htmlVisitor).join('');
    expect(html).toBe('<p>This is a paragraph with <strong>bold</strong> text and a <sup class="footnote"><fr>1.1: </fr><ft>Note text.</ft></sup> footnote.</p>');

    // Convert to USX
    const usxVisitor = new USXVisitor();
    const usx = parser.visit(usxVisitor).join('');
    expect(usx).toBe('<para style="p">This is a paragraph with <char style="bd">bold</char> text and a <note style="f" caller="+"><char style="fr">1.1: </char><char style="ft">Note text.</char></note> footnote.</para>');

    // Convert to USJ
    const usjVisitor = new USJVisitor();
    const usj = parser.visit(usjVisitor);
    expect(usj).toEqual([{
      type: 'paragraph',
      marker: 'p',
      content: [
        {
          type: 'text',
          content: 'This is a paragraph with '
        },
        {
          type: 'character',
          marker: 'bd',
          content: [{
            type: 'text',
            content: 'bold'
          }]
        },
        {
          type: 'text',
          content: ' text and a '
        },
        {
          type: 'note',
          marker: 'f',
          caller: '+',
          content: [
            {
              type: 'character',
              marker: 'fr',
              content: [{
                type: 'text',
                content: '1.1: '
              }]
            },
            {
              type: 'character',
              marker: 'ft',
              content: [{
                type: 'text',
                content: 'Note text.'
              }]
            }
          ]
        },
        {
          type: 'text',
          content: ' footnote.'
        }
      ]
    }]);
  });

  const readFixture = (filename: string) => {
    return fs.readFileSync(
      path.join(__dirname, 'fixtures', 'usfm', filename),
      'utf8'
    );
  };

  test('parses alignment USFM file', () => {
    const input = readFixture('alignment.usfm');
    
    const textVisitor = new TextVisitor();
    parser.load(input).parse().visit(textVisitor);
    const text = textVisitor.getResult();
    expect(text).toMatchSnapshot();
  });
}); 
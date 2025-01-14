import { USFMParser } from "..";

describe("USFMParser", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test("parses paragraph marker", () => {
    const input = String.raw`\p this is a paragraph.
\p
\v 1 this is some text \bd that \+it I want\+it* to make bold\bd*\f + \fr 1.1: \ft Note text: \fq quoted text.\f* for testing. `;
    const result = parser.load(input).parse().getNodes();

    console.log(JSON.stringify(result, null, 2));

    expect(result).toEqual([
      {
        "type": "paragraph",
        "marker": "p",
        "content": [
          {
            "type": "text",
            "content": "this is a paragraph."
          }
        ]
      },
      {
        "type": "paragraph",
        "marker": "p",
        "content": [
          {
            "type": "character",
            "marker": "v",
            "content": [
              {
                "type": "text",
                "content": "1"
              }
            ]
          },
          {
            "type": "text",
            "content": "this is some text "
          },
          {
            "type": "character",
            "marker": "bd",
            "content": [
              {
                "type": "text",
                "content": "that "
              },
              {
                "type": "character",
                "marker": "it",
                "content": [
                  {
                    "type": "text",
                    "content": "I want"
                  }
                ]
              },
              {
                "type": "text",
                "content": " to make bold"
              }
            ]
          },
          {
            "type": "note",
            "marker": "f",
            "content": [
              {
                "type": "character",
                "marker": "fr",
                "content": [
                  {
                    "type": "text",
                    "content": "1.1: "
                  }
                ]
              },
              {
                "type": "character",
                "marker": "ft",
                "content": [
                  {
                    "type": "text",
                    "content": "Note text: "
                  }
                ]
              },
              {
                "type": "character",
                "marker": "fq",
                "content": [
                  {
                    "type": "text",
                    "content": "quoted text."
                  }
                ]
              }
            ],
            "caller": "+"
          },
          {
            "type": "text",
            "content": " for testing. "
          }
        ]
      }
    ]);
  });

  // test("parses character marker", () => {
  //   const input = "\\bd Bold text\\bd*";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "character",
  //       marker: "bd",
  //       content: [
  //         {
  //           type: "text",
  //           content: "Bold text",
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses verse marker", () => {
  //   const input = "\\v 1 In the beginning";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "verse",
  //       marker: "v",
  //       number: "1",
  //       content: [
  //         {
  //           type: "text",
  //           content: "In the beginning",
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses verse with footnote", () => {
  //   const input = "\\v 1 In the beginning\\f + \\fr 1.1 \\ft Note text\\f*";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "verse",
  //       marker: "v",
  //       number: "1",
  //       content: [
  //         {
  //           type: "text",
  //           content: "In the beginning",
  //         },
  //         {
  //           type: "note",
  //           marker: "f",
  //           caller: "+",
  //           content: [
  //             {
  //               type: "character",
  //               marker: "fr",
  //               content: [
  //                 {
  //                   type: "text",
  //                   content: "1.1",
  //                 },
  //               ],
  //             },
  //             {
  //               type: "character",
  //               marker: "ft",
  //               content: [
  //                 {
  //                   type: "text",
  //                   content: "Note text",
  //                 },
  //               ],
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses complex footnote with multiple elements", () => {
  //   const input = "\\f + \\fr 1.1 \\fk Key term\\ft Note text\\fq quoted text\\f*";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "note",
  //       marker: "f",
  //       caller: "+",
  //       content: [
  //         {
  //           type: "character",
  //           marker: "fr",
  //           content: [
  //             {
  //               type: "text",
  //               content: "1.1",
  //             },
  //           ],
  //         },
  //         {
  //           type: "character",
  //           marker: "fk",
  //           content: [
  //             {
  //               type: "text",
  //               content: "Key term",
  //             },
  //           ],
  //         },
  //         {
  //           type: "character",
  //           marker: "ft",
  //           content: [
  //             {
  //               type: "text",
  //               content: "Note text",
  //             },
  //           ],
  //         },
  //         {
  //           type: "character",
  //           marker: "fq",
  //           content: [
  //             {
  //               type: "text",
  //               content: "quoted text",
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses nested character markers", () => {
  //   const input = "\\bd Bold \\it italic\\it* text\\bd*";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "character",
  //       marker: "bd",
  //       content: [
  //         {
  //           type: "text",
  //           content: "Bold ",
  //         },
  //         {
  //           type: "character",
  //           marker: "it",
  //           content: [
  //             {
  //               type: "text",
  //               content: "italic",
  //             },
  //           ],
  //         },
  //         {
  //           type: "text",
  //           content: " text",
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses verses within paragraphs", () => {
  //   const input = "\\p \\v 1 First verse \\v 2 Second verse";
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "paragraph",
  //       marker: "p",
  //       content: [
  //         {
  //           type: "verse",
  //           marker: "v",
  //           number: "1",
  //           content: [
  //             {
  //               type: "text",
  //               content: "First verse ",
  //             },
  //           ],
  //         },
  //         {
  //           type: "verse",
  //           marker: "v",
  //           number: "2",
  //           content: [
  //             {
  //               type: "text",
  //               content: "Second verse",
  //             },
  //           ],
  //         },
  //       ],
  //     },
  //   ]);
  // });

  // test("parses character marker with attributes", () => {
  //   const input = '\\w gracious|lemma="חנן"\\w*';
  //   const result = parser.parse(input);

  //   expect(result).toEqual([
  //     {
  //       type: "character",
  //       marker: "w",
  //       content: [
  //         {
  //           type: "text",
  //           content: "gracious",
  //         },
  //       ],
  //       attributes: {
  //         lemma: "חנן",
  //       },
  //     },
  //   ]);
  // });
});

import { USFMParser } from "..";

describe("USFMParser - Nested Character Markers", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test("parses simple nested markers", () => {
    const input = "\\bd Bold \\+it italic\\+it*\\bd*";
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "character",
        marker: "bd",
        content: [
          {
            type: "text",
            content: "Bold ",
          },
          {
            type: "character",
            marker: "it",
            content: [
              {
                type: "text",
                content: "italic",
              },
            ],
          },
        ],
      },
    ]);
  });

  test("parses nested marker with attribute", () => {
    const input = '\\bd some bold \\+w word|lemma="test"\\+w*\\bd*';
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "character",
        marker: "bd",
        content: [
          {
            type: "text",
            content: "some bold ",
          },
          {
            type: "character",
            marker: "w",
            content: [
              {
                type: "text",
                content: "word",
              },
            ],
            attributes: {
              lemma: "test",
            },
          },
        ],
      },
    ]);
  });
});

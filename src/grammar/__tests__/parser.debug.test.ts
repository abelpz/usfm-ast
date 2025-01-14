import { USFMParser } from "..";

describe("USFMParser - Debug", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test("parses simple paragraph", () => {
    const input = "\\p Test";
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "paragraph",
        marker: "p",
        content: [
          {
            type: "text",
            content: "Test",
          },
        ],
      },
    ]);
  });
});

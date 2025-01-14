import { USFMParser } from "..";

describe("USFMParser - Basic Features", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  describe("Peripheral Content", () => {
    test("parses identification marker", () => {
      const input = "\\id TIT Español de Latinoamérica, 1994";
      const result = parser.parse(input);

      expect(result).toEqual([
        {
          type: "paragraph",
          marker: "id",
          code: "TIT",
          content: [
            {
              type: "text",
              content: "Español de Latinoamérica, 1994",
            },
          ],
        },
      ]);
    });
  });
});

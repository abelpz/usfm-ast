import { USFMParser } from "..";

describe("USFMParser - Z-namespace", () => {
  test("parses custom paragraph marker", () => {
    const parser = new USFMParser({
      customMarkerRules: {
        zp: { type: "paragraph" },
      },
    });

    const input = "\\zp Custom paragraph";
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "paragraph",
        marker: "zp",
        content: [
          {
            type: "text",
            content: "Custom paragraph",
          },
        ],
      },
    ]);
  });

  test("parses custom character marker", () => {
    const parser = new USFMParser({
      customMarkerRules: {
        zchar: { type: "character" },
      },
    });

    const input = "\\zchar Custom style\\zchar*";
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "character",
        marker: "zchar",
        content: [
          {
            type: "text",
            content: "Custom style",
          },
        ],
      },
    ]);
  });

  test("parses custom milestone marker", () => {
    const parser = new USFMParser({
      customMarkerRules: {
        zmil: { type: "milestone", isMilestone: true },
      },
    });

    const input = '\\zmil-s |sid="test"\\*';
    const result = parser.parse(input);

    expect(result).toEqual([
      {
        type: "milestone",
        marker: "zmil",
        milestoneType: "start",
        attributes: {
          sid: "test",
        },
      },
    ]);
  });
});

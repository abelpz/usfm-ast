/** Strip first `# ` heading (avoid duplicate title in article overlay). */

export function removeFirstHeading(content: string): string {
  const lines = content.split('\n');
  let firstHeadingRemoved = false;

  return lines
    .filter((line) => {
      if (!firstHeadingRemoved && line.trim().startsWith('# ')) {
        firstHeadingRemoved = true;
        return false;
      }
      return true;
    })
    .join('\n');
}

export function removeFirstHeadingAndDefinition(content: string): string {
  const lines = content.split('\n');
  let firstHeadingRemoved = false;
  let definitionHeadingRemoved = false;

  return lines
    .filter((line) => {
      const trimmed = line.trim();

      if (!firstHeadingRemoved && trimmed.startsWith('# ')) {
        firstHeadingRemoved = true;
        return false;
      }

      if (firstHeadingRemoved && !definitionHeadingRemoved && trimmed.startsWith('## Definition:')) {
        definitionHeadingRemoved = true;
        return false;
      }

      return true;
    })
    .join('\n');
}

/**
 * Renders a walk path for a log line.
 *
 * Paths are worth printing whole — a character that visibly crosses half the
 * map is either walking a path the client computed that way or one the server
 * sent back that way, and printing only the two ends makes those two cases
 * indistinguishable. But a 64-cell path (`MAX_PATH_LENGTH` on the server) in
 * full would drown the line, so a long one keeps its head and its tail and
 * says how much it dropped.
 */
const HEAD = 12;
const TAIL = 8;

export function formatPath(cells: readonly number[]): string {
  if (cells.length <= HEAD + TAIL) {
    return `[${cells.join(",")}]`;
  }

  const head = cells.slice(0, HEAD).join(",");
  const tail = cells.slice(-TAIL).join(",");
  const hidden = cells.length - HEAD - TAIL;

  return `[${head},…${hidden} more…,${tail}]`;
}

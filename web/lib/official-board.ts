import type { OfficialBoard, ServiceId } from "./engine/types";

/** Exact board columns the operator publishes for one physical station kerb. */
export function officialBoardAt(boards: readonly OfficialBoard[], stopId: string,
                                stopRo: string, service: ServiceId,
                                headsigns: ReadonlyMap<string, ReadonlySet<string>> = new Map()): OfficialBoard[] {
  const named = boards.filter((board) =>
    (board.stopId ? board.stopId === stopId : board.stopRo === stopRo) && board[service].length > 0);
  const compact = (value: string) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const sameDestination = (left: string, right: string) => compact(left) === compact(right);

  return named.filter((board) => {
    const available = headsigns.get(board.lineId);
    if (!available || available.size === 0) return true;
    const sourceForLine = named.filter((candidate) => candidate.lineId === board.lineId);
    const lineHasRecognisedDirection = sourceForLine.some((candidate) =>
      [...available].some((headsign) => sameDestination(candidate.destination, headsign)));
    return !lineHasRecognisedDirection || [...available].some((headsign) =>
      sameDestination(board.destination, headsign));
  });
}

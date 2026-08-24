import type { OfficialBoard, ServiceId } from "./engine/types";

/** Exact board columns the operator publishes for one named station. */
export function officialBoardAt(boards: readonly OfficialBoard[], stopRo: string,
                                service: ServiceId): OfficialBoard[] {
  return boards.filter((board) => board.stopRo === stopRo && board[service].length > 0);
}

import { useMemo } from "react";
import { RecommendItem } from "@/lib/api";

export interface ChunkModeState {
  /** True when the session was built via /session/manual with N > 1 articles. */
  isChunkMode: boolean;
  /** Minutes allocated per article chunk. */
  chunkTime: number;
  /** Total number of articles in the chunk session. */
  totalArticles: number;
}

/**
 * Derives chunk-mode metadata from the session items and time budget.
 *
 * State machine:
 *   N = 1  →  isChunkMode = false (normal reading)
 *   N > 1  →  isChunkMode = true  (equal chunk mode)
 *              chunkTime = timeBudget / N
 */
export function useChunkMode(items: RecommendItem[], timeBudget: number): ChunkModeState {
  return useMemo(() => {
    const isChunkMode = items.length > 1;
    const chunkTime = isChunkMode && items.length > 0 ? timeBudget / items.length : timeBudget;
    return { isChunkMode, chunkTime, totalArticles: items.length };
  }, [items, timeBudget]);
}

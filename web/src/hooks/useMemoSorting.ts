import { useMemo } from "react";
import { useView } from "@/contexts/ViewContext";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

export interface UseMemoSortingOptions {
  pinnedFirst?: boolean;
  state?: State;
}

export interface UseMemoSortingResult {
  listSort: (memos: Memo[]) => Memo[];
  orderBy: string;
}

export const useMemoSorting = (options: UseMemoSortingOptions = {}): UseMemoSortingResult => {
  const { pinnedFirst = false, state = State.NORMAL } = options;
  const { orderByTimeAsc, timeBasis } = useView();

  // Generate orderBy string for API
  const orderBy = useMemo(() => {
    const timeOrder = orderByTimeAsc ? `${timeBasis} asc` : `${timeBasis} desc`;
    return pinnedFirst ? `pinned desc, ${timeOrder}` : timeOrder;
  }, [pinnedFirst, orderByTimeAsc, timeBasis]);

  // Client-side state filter (sorting is handled server-side via orderBy)
  const listSort = useMemo(() => {
    return (memos: Memo[]): Memo[] => {
      return memos.filter((memo) => memo.state === state);
    };
  }, [state]);

  return { listSort, orderBy };
};

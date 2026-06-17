import MemoView from "@/components/MemoView/MemoView";
import PagedMemoList from "@/components/PagedMemoList";
import TimeTravelToggle from "@/components/TimeTravelToggle";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import { useTimeTravelParam } from "@/hooks/useTimeTravelParam";
import useCurrentUser from "@/hooks/useCurrentUser";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";

const Home = () => {
  const user = useCurrentUser();
  const { isInitialized } = useInstance();

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeShortcuts: true,
    includePinned: true,
  });

  const timeTravelParam = useTimeTravelParam();

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      <TimeTravelToggle />
      <PagedMemoList
        renderer={(memo: Memo) => <MemoView key={`${memo.name}-${memo.updateTime}`} memo={memo} showVisibility showPinned compact />}
        listSort={listSort}
        orderBy={orderBy}
        filter={memoFilter}
        enabled={isInitialized}
        showMemoEditor
        extraQueryParams={timeTravelParam}
      />
    </div>
  );
};

export default Home;

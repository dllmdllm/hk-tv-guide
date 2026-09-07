"use client";

import { GuideChrome, GuideFooter } from "./components/guide-chrome";
import { GuideGrid } from "./components/guide-grid";
import { useTvGuide } from "./hooks/use-tv-guide";

export function TvGuide() {
  const guide = useTvGuide();

  return (
    <main className="site-shell">
      <GuideChrome
        selectedDate={guide.selectedDate}
        dates={guide.dates}
        currentIndex={guide.currentIndex}
        moveDate={guide.moveDate}
        setSelectedDate={guide.setSelectedDate}
        liveCount={guide.liveCount}
        query={guide.query}
        setQuery={guide.setQuery}
        operatorFilter={guide.operatorFilter}
        setOperatorFilter={guide.setOperatorFilter}
        scrollToNow={guide.scrollToNow}
        statusErrors={guide.statusErrors}
        sourceStatus={guide.sourceStatus}
        hiddenSearchHits={guide.hiddenSearchHits}
        revealSearchChannel={guide.revealSearchChannel}
        needle={guide.needle}
        matchedCount={guide.matchedCount}
      />

      <section className="guide-section" aria-label={`${guide.selectedDate} 電視節目表`}>
        <div className="guide-summary">
          <div>
            <p className="eyebrow">00:00 — 23:59</p>
            <h2>全日節目表</h2>
          </div>
          <span>
            顯示 {guide.displayChannels.length} / {guide.availableChannels.length} 個台 ·{" "}
            {guide.allVisibleProgrammes.length} 個節目
          </span>
        </div>

        {guide.loading && (
          <div className="state-card">
            <span className="loader" />
            正在整理節目表…
          </div>
        )}
        {!guide.loading && guide.error && (
          <div className="state-card error">
            <strong>未有資料</strong>
            <span>{guide.error}</span>
          </div>
        )}
        {!guide.loading && !guide.error && (
          <GuideGrid
            displayChannels={guide.displayChannels}
            availableChannels={guide.availableChannels}
            activeChannelIds={guide.activeChannelIds}
            columnCount={guide.columnCount}
            handleChannelSlotChange={guide.handleChannelSlotChange}
            programmesByChannel={guide.programmesByChannel}
            selectedDate={guide.selectedDate}
            now={guide.now}
            nowMinutes={guide.nowMinutes}
            gridRef={guide.gridRef}
          />
        )}
      </section>

      <GuideFooter updatedAt={guide.schedule?.updatedAt} sourceStatus={guide.sourceStatus} />
    </main>
  );
}

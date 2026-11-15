import React from 'react';
import { formatRegionLabel } from '../../utils/hudModel';

function SelenisMark() {
  return (
    <img
      src="/textures/logo_selenis.svg"
      alt="Selenis logo"
      className="h-7 w-7 shrink-0 object-contain select-none"
    />
  );
}

const NAV_TABS = [
  {
    id: 'navigate',
    label: 'Navigate',
    subtitle: 'your landing site',
    icon: 'nearby',
  },
  {
    id: 'view',
    label: 'View',
    subtitle: 'your site 360° panorama',
    icon: 'simulation',
  },
  {
    id: 'read',
    label: 'Read',
    subtitle: 'comprehensive summary',
    icon: 'draft',
  },
];

const UI_MODES = [
  {
    id: 'planner',
    label: 'Planner',
    roleLabel: 'Professional',
    icon: 'engineering',
    title: 'Planner Mode (Professional) — Complete technical telemetry & full analysis tools',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    roleLabel: 'General',
    icon: 'explore',
    title: 'Explorer Mode (General) — Simplified, easy-to-read key metrics',
  },
];

export function LeftSidebar({
  activeTab,
  onSelectTab,
  uiMode = 'planner',
  onToggleUiMode,
  collapsed,
  onToggleCollapse,
  dataError,
  regionName,
  regionError,
  onBackToLanding,
  onOpenTutorial,
}) {
  const displayRegion = formatRegionLabel(regionName) || 'Lunar South Pole';

  return (
    <aside
      aria-label="Selenis Main Navigation"
      data-testid="left-sidebar"
      className={`font-jakarta pointer-events-auto relative z-20 flex h-full shrink-0 flex-col justify-between border-r border-white/[0.06] bg-[#0b0c0e]/95 transition-all duration-200 select-none ${
        collapsed ? 'w-16 px-2 py-4' : 'w-56 px-3 py-4'
      }`}
    >
      {/* Top Brand Header + Collapse Toggle */}
      <div>
        <div
          className={`flex items-center ${
            collapsed ? 'flex-col justify-center gap-3' : 'justify-between px-1'
          }`}
        >
          <button
            type="button"
            onClick={onBackToLanding}
            title="Return to Selenis Landing Page"
            className="group flex items-center gap-2 text-left focus:outline-none"
          >
            <SelenisMark />
            {!collapsed && (
              <span className="font-selenis text-[19px] font-semibold tracking-tight text-white transition group-hover:text-neutral-300">
                selenis
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand left sidebar' : 'Collapse left sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid="toggle-left-sidebar"
            className="flex h-8 w-8 items-center justify-center rounded text-[#8e939e] transition hover:bg-[#1c1f24] hover:text-white"
          >
            <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
              {collapsed ? 'left_panel_open' : 'left_panel_close'}
            </span>
          </button>
        </div>

        {/* 3 Main Section Tabs (Navigate, View, Read) with Google Material Symbols */}
        <nav aria-label="Primary modes" className="mt-7 flex flex-col gap-2">
          {NAV_TABS.map(({ id, label, subtitle, icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`main-tab-${id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(id)}
                title={`${label} — ${subtitle}`}
                className={`group flex w-full items-center gap-3 rounded transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 text-left'
                } ${
                  isActive
                    ? 'bg-[#23262d] text-white'
                    : 'bg-transparent text-[#8e939e] hover:bg-[#17191e] hover:text-white'
                }`}
              >
                <span
                  className={`material-symbols-outlined shrink-0 text-[24px] transition-colors ${
                    isActive ? 'text-white' : 'text-[#9ca3af] group-hover:text-white'
                  }`}
                  aria-hidden="true"
                >
                  {icon}
                </span>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold leading-tight text-white">
                      {label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-normal text-[#8e939e]">
                      {subtitle}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Planner (Professional) vs Explorer (General) Toggle Below the 3 Sections */}
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          {!collapsed ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold tracking-wider text-[#7c818c] uppercase">
                  Experience Mode
                </span>
                <span className="text-[10px] font-medium text-[#9ca3af]">
                  {uiMode === 'planner' ? 'Professional' : 'General'}
                </span>
              </div>
              <div
                role="group"
                aria-label="Experience mode toggle"
                data-testid="left-mode-toggle"
                className="grid grid-cols-2 gap-1 rounded bg-[#14161b] p-1"
              >
                {UI_MODES.map(({ id, label, roleLabel, icon, title }) => {
                  const isActive = uiMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`mode-btn-${id}`}
                      aria-pressed={isActive}
                      onClick={() => onToggleUiMode?.(id)}
                      title={title}
                      className={`flex flex-col items-center justify-center rounded-sm py-1.5 px-2 text-center transition ${
                        isActive
                          ? 'bg-[#252830] text-white'
                          : 'text-[#8e939e] hover:bg-[#1b1e25] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="text-[11.5px] font-semibold">{label}</span>
                      </div>
                      <span className="text-[9.5px] text-[#8e939e]">{roleLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="left-mode-toggle-collapsed"
              onClick={() => onToggleUiMode?.(uiMode === 'planner' ? 'explorer' : 'planner')}
              title={`Mode: ${uiMode === 'planner' ? 'Planner (Professional)' : 'Explorer (General)'} — Click to switch`}
              aria-label="Toggle Planner or Explorer mode"
              className="flex w-full flex-col items-center justify-center gap-1 rounded bg-[#14161b] p-2 text-[#d1d5db] transition hover:bg-[#23262d] hover:text-white"
            >
              <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
                {uiMode === 'planner' ? 'engineering' : 'explore'}
              </span>
              <span className="text-[9px] font-semibold uppercase">
                {uiMode === 'planner' ? 'Pro' : 'Gen'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Footer: Tutorial Button + Region Indicator */}
      <div className="space-y-2.5 border-t border-white/[0.05] pt-3">
        {onOpenTutorial && (
          <button
            type="button"
            onClick={onOpenTutorial}
            data-testid="open-tutorial-btn"
            title="Start Step-by-Step Feature Tutorial"
            className={`flex w-full items-center rounded bg-[#14161b] text-xs font-medium text-[#b4b8c2] transition hover:bg-[#1f222a] hover:text-white ${
              collapsed ? 'justify-center p-2' : 'gap-2 px-2.5 py-2'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              help
            </span>
            {!collapsed && <span>Tutorial</span>}
          </button>
        )}

        {!collapsed && (
          <div className="px-1">
            <div className="truncate text-[11px] font-medium text-[#7c818c]" title={displayRegion}>
              {displayRegion}
            </div>
            {dataError && (
              <p role="alert" data-testid="data-error" className="mt-1 text-[10px] text-neutral-400">
                Dataset fallback active ({dataError})
              </p>
            )}
            {regionError && (
              <p role="status" className="mt-1 text-[10px] text-neutral-400">
                Region catalog unavailable; Region 01 active.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

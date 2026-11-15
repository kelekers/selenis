import React from 'react';
import { formatRegionLabel } from '../../utils/hudModel';

function SelenisMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0 text-white" fill="none" aria-hidden="true">
      {/* Crescent Moon */}
      <path
        d="M17.5 5.5C11.7 6.2 7.5 11.1 7.5 17C7.5 23.4 12.6 28.5 19 28.5C22.4 28.5 25.4 27 27.5 24.7C21.8 25.2 16.8 20.8 16.8 15C16.8 11.1 19.1 7.7 22.4 6.2C20.8 5.7 19.2 5.4 17.5 5.5Z"
        fill="currentColor"
      />
      {/* Orbital Swoosh */}
      <path
        d="M4.5 21.5C8.5 25.5 18.5 23.5 27.5 12.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="27.5" cy="12.5" r="1.8" fill="#d1d5db" />
    </svg>
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

export function LeftSidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  dataError,
  regionName,
  regionError,
  onBackToLanding,
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
                  className={`material-symbols-outlined text-[24px] shrink-0 transition-colors ${
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
      </div>

      {/* Subtle Region Footer */}
      {!collapsed && (
        <div className="border-t border-white/[0.05] px-1 pt-3">
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
    </aside>
  );
}

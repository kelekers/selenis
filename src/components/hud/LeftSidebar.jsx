import React from 'react';
import { dataModeBadge } from '../../utils/hudModel';

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
      <circle cx="27.5" cy="12.5" r="1.8" fill="#f59e0b" />
    </svg>
  );
}

function NavigateIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden="true">
      <rect
        x="18"
        y="3.5"
        width="20.5"
        height="20.5"
        rx="2.5"
        transform="rotate(45 18 3.5)"
        stroke="currentColor"
        strokeWidth="3.2"
      />
      <circle cx="18" cy="18" r="3.2" fill="currentColor" />
    </svg>
  );
}

function ViewPanoramaIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden="true">
      {/* Curved 360° Panorama Frame */}
      <path
        d="M5 10.5C12.5 13.5 23.5 13.5 31 10.5V25.5C23.5 22.5 12.5 22.5 5 25.5V10.5Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 12.2V23.8M24.5 12.2V23.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeOpacity="0.7"
      />
      {/* Viewer head & shoulders */}
      <circle cx="18" cy="16.5" r="2.6" fill="currentColor" />
      <path
        d="M13.5 23.5C13.5 20.9 15.5 19.5 18 19.5C20.5 19.5 22.5 20.9 22.5 23.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReadDocIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden="true">
      <path
        d="M9 6.5C9 5.4 9.9 4.5 11 4.5H21.2L27 10.3V29.5C27 30.6 26.1 31.5 25 31.5H11C9.9 31.5 9 30.6 9 29.5V6.5Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 4.5V11H27"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarCollapseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const NAV_TABS = [
  {
    id: 'navigate',
    label: 'Navigate',
    subtitle: 'your landing site',
    Icon: NavigateIcon,
  },
  {
    id: 'view',
    label: 'View',
    subtitle: 'your site 360° panorama',
    Icon: ViewPanoramaIcon,
  },
  {
    id: 'read',
    label: 'Read',
    subtitle: 'comprehensive summary',
    Icon: ReadDocIcon,
  },
];

export function LeftSidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  dataMode,
  dataError,
  regionName,
  regionError,
  onBackToLanding,
}) {
  const badge = dataModeBadge(dataMode);

  return (
    <aside
      aria-label="Navigasi Utama Selenis"
      data-testid="left-sidebar"
      className={`pointer-events-auto relative z-20 flex h-full shrink-0 flex-col justify-between border-r border-white/10 bg-[#111214]/95 transition-all duration-200 select-none ${
        collapsed ? 'w-16 px-2 py-4' : 'w-56 px-3.5 py-4'
      }`}
    >
      {/* Top Brand Header + Collapse Toggle */}
      <div>
        <div
          className={`flex items-center ${
            collapsed ? 'flex-col gap-3 justify-center' : 'justify-between px-1'
          }`}
        >
          <button
            type="button"
            onClick={onBackToLanding}
            title="Selenis — Lunar South Pole Navigator"
            className="group flex items-center gap-2 text-left focus:outline-none"
          >
            <SelenisMark />
            {!collapsed && (
              <span className="font-selenis text-[19px] font-semibold tracking-tight text-white transition group-hover:text-amber-300">
                selenis
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Perluas sidebar kiri' : 'Ciutkan sidebar kiri'}
            title={collapsed ? 'Perluas sidebar kiri' : 'Ciutkan sidebar kiri'}
            data-testid="toggle-left-sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <SidebarCollapseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 3 Main Section Tabs (Navigate, View, Read) */}
        <nav aria-label="Mode utama" className="mt-8 flex flex-col gap-3">
          {NAV_TABS.map(({ id, label, subtitle, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`main-tab-${id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(id)}
                title={`${label} — ${subtitle}`}
                className={`group flex w-full items-center gap-3.5 rounded-xl transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'px-3.5 py-3 text-left'
                } ${
                  isActive
                    ? 'border border-[#522927] bg-[#2c1616] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'border border-transparent bg-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon
                  className={`h-8 w-8 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-slate-200'
                  }`}
                />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold leading-tight text-white">
                      {label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-normal text-slate-400">
                      {subtitle}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Region & Data Provenance Status */}
      <div className="border-t border-white/10 pt-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5" title={`${regionName} · ${badge.label}`}>
            <span
              data-testid="data-mode-badge"
              className={`h-2.5 w-2.5 rounded-full ${
                badge.tone === 'team' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            >
              <span className="sr-only">{badge.label}</span>
            </span>
          </div>
        ) : (
          <div className="space-y-1.5 px-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold text-slate-200" title={regionName}>
                {regionName || 'Lunar South Pole'}
              </span>
            </div>
            <div
              data-testid="data-mode-badge"
              className={`inline-block rounded-md px-2 py-0.5 font-mono text-[9.5px] font-medium ${
                badge.tone === 'team'
                  ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                  : 'border border-amber-400/40 bg-amber-500/15 text-amber-200'
              }`}
            >
              {badge.label}
            </div>
            {dataError && (
              <p role="alert" data-testid="data-error" className="font-mono text-[10px] text-red-300">
                Data tim gagal dimuat ({dataError})
              </p>
            )}
            {regionError && (
              <p role="status" className="text-[10px] text-amber-200">
                Daftar kawasan gagal dimuat; Site01 tetap tersedia.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

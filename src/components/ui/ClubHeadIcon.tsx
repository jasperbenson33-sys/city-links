'use client';

import React, { useId } from 'react';

export type AnyClubIconId =
  | 'driver'
  | 'wedge'
  | 'skimmer'
  | 'putter'
  | '7i'
  | 'pw';

interface ClubHeadIconProps {
  club: AnyClubIconId;
  className?: string;
}

/**
 * Crisp custom SVG club + trajectory icons for Curbside Links:
 * - Driver (Sky): titanium wood head + soaring high-carry arc
 * - Wedge (Lob): lofted tour wedge + steep pop-up lob arc
 * - Skimmer (Curb): low-flight iron + sharp curb-ricochet trajectory
 * - Putter (Roll): blade putter + clean ground-roll line to cup
 */
export function ClubHeadIcon({
  club,
  className = 'h-5 w-5',
}: ClubHeadIconProps) {
  const rawId = useId();
  const maskId = `club-mask-${club}-${rawId.replace(/:/g, '')}`;

  const normalized =
    club === 'pw' ? 'wedge' : club === '7i' ? 'skimmer' : club;

  switch (normalized) {
    case 'driver':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <mask id={maskId}>
              <rect width="24" height="24" fill="white" />
              <path
                d="M6.4 15.2L10.6 14.9"
                stroke="black"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          {/* Soaring high sky-carry arc */}
          <path
            d="M4.5 18.5C8.5 7.2 15.2 4.8 20.5 8.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray="2.5 2.4"
            opacity="0.72"
          />
          <circle cx="20.5" cy="8.5" r="1.7" fill="currentColor" />
          {/* Driver wood head */}
          <g mask={`url(#${maskId})`}>
            <path
              d="M3.2 8.2L5.6 13.8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M4.8 13.5C7.1 12.4 11.4 12.6 13.1 14.5C14.3 15.8 13.8 18.4 11.7 19.4C9.5 20.4 5.7 20.1 4.2 18.6C3.3 17.7 3.7 15.0 4.8 13.5Z"
              fill="currentColor"
            />
          </g>
        </svg>
      );

    case 'wedge':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <mask id={maskId}>
              <rect width="24" height="24" fill="white" />
              <path
                d="M7.0 15.6L11.0 14.0"
                stroke="black"
                strokeWidth="1.15"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          {/* Steep high lob arc dropping softly */}
          <path
            d="M5.5 18.5C7.2 5.4 14.6 3.5 18.4 14.2"
            stroke="currentColor"
            strokeWidth="1.85"
            strokeLinecap="round"
          />
          <path
            d="M16.2 13.2L18.6 15.3L20.4 12.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Lofted wedge head */}
          <g mask={`url(#${maskId})`}>
            <path
              d="M3.4 9.2L5.5 14.4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5.0 14.3L10.8 11.4C11.9 10.9 13.1 11.8 12.9 13.1L12.3 17.4C12.1 18.7 11.0 19.5 9.6 19.4L4.8 18.9C3.9 18.8 3.5 18.0 3.9 17.0L5.0 14.3Z"
              fill="currentColor"
            />
          </g>
        </svg>
      );

    case 'skimmer':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          {/* Low flat curb-skim + crisp ricochet bounce trajectory */}
          <path
            d="M3.8 17.8L12.2 14.5L19.6 9.2"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Ricochet spark / curb corner */}
          <path
            d="M10.4 17.8H14.2V14.4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.65"
          />
          <path
            d="M17.2 8.7L20.1 8.8L19.4 11.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Compact iron blade */}
          <path
            d="M3.5 9.8L5.3 14.8L9.6 13.9C10.4 13.7 10.9 14.4 10.6 15.2L9.9 17.6C9.7 18.2 9.1 18.6 8.4 18.6H4.6"
            stroke="currentColor"
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'putter':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          {/* Clean flat green roll line into cup */}
          <path
            d="M8.8 18.4H16.6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <circle cx="19.2" cy="18.4" r="2.1" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M19.2 16.3V8.2"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M19.2 8.4L22.2 9.8L19.2 11.2"
            fill="currentColor"
          />
          {/* Blade putter head */}
          <path
            d="M5.2 8.5V14.6H7.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="2.8"
            y="14.6"
            width="7.2"
            height="4.4"
            rx="1.6"
            fill="currentColor"
          />
        </svg>
      );
  }
}

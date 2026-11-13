import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(160deg, #FFE6B8 0%, #FFB980 48%, #E27252 100%)',
        }}
      >
        {/* Warm Golden Sun Halo */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 40,
            right: 48,
            width: 132,
            height: 132,
            borderRadius: 66,
            background: 'linear-gradient(180deg, #FFFDF2 0%, #FFE08A 100%)',
            boxShadow: '0 0 48px rgba(255, 236, 170, 0.85)',
          }}
        />

        {/* Terracotta Brownstone Silhouette */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 140,
            left: 52,
            width: 124,
            height: 184,
            borderRadius: 20,
            background: 'linear-gradient(180deg, #D96B4B 0%, #B54D32 100%)',
          }}
        />

        {/* Flagstick & Coral Pennant on Right */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 148,
            right: 118,
            width: 12,
            height: 190,
            borderRadius: 6,
            background: '#FFFDF7',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 168,
            right: 60,
            width: 64,
            height: 44,
            borderTopRightRadius: 14,
            borderBottomRightRadius: 14,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            background: 'linear-gradient(90deg, #EF4444 0%, #F97316 100%)',
          }}
        />

        {/* Hole 1: 5th & Mercer Badge along Top-Left */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 44,
            left: 44,
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'rgba(255, 253, 248, 0.92)',
            border: '3px solid #E2C294',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 16,
              height: 16,
              borderRadius: 8,
              background: '#D95D39',
            }}
          />
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#231914',
              letterSpacing: '-0.02em',
            }}
          >
            5TH &amp; MERCER
          </span>
        </div>

        {/* Lush Mint Courtyard Turf Hill */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: -95,
            left: -45,
            width: 602,
            height: 295,
            borderRadius: 295,
            background:
              'linear-gradient(180deg, #4ADE80 0%, #10B981 55%, #059669 100%)',
            border: '10px solid #A7F3D0',
          }}
        />

        {/* Soft Ball Shadow on Mint Green */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 92,
            left: 152,
            width: 208,
            height: 44,
            borderRadius: 22,
            background: 'rgba(6, 78, 59, 0.34)',
          }}
        />

        {/* Sunlit Cream-White Golf Ball */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            marginTop: 58,
            width: 228,
            height: 228,
            borderRadius: 114,
            background:
              'linear-gradient(145deg, #FFFFFF 0%, #FFF9EE 58%, #EAD4B5 100%)',
            border: '6px solid #FFFDF9',
            boxShadow: '0 18px 34px rgba(43, 32, 26, 0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 46,
              left: 64,
              width: 22,
              height: 22,
              borderRadius: 11,
              background: '#E8D5BA',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 38,
              left: 108,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: '#E8D5BA',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 82,
              left: 44,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: '#E8D5BA',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 78,
              left: 90,
              width: 24,
              height: 24,
              borderRadius: 12,
              background: '#E5CEAF',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 122,
              left: 68,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: '#E2C8A6',
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

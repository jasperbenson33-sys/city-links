import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

const FLAG_COLORS = ['#EF4444', '#FACC15', '#3B82F6', '#A855F7', '#22C55E'];

export default function AppleIcon() {
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
            top: 14,
            right: 16,
            width: 46,
            height: 46,
            borderRadius: 23,
            background: 'linear-gradient(180deg, #FFFDF2 0%, #FFE08A 100%)',
          }}
        />

        {/* Terracotta City Block Accent */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 48,
            left: 18,
            width: 44,
            height: 64,
            borderRadius: 8,
            background: 'linear-gradient(180deg, #D96B4B 0%, #B54D32 100%)',
          }}
        />

        {/* Flagstick & Coral Pennant */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 52,
            right: 42,
            width: 5,
            height: 68,
            borderRadius: 3,
            background: '#FFFDF7',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 58,
            right: 20,
            width: 24,
            height: 16,
            borderTopRightRadius: 6,
            borderBottomRightRadius: 6,
            background: 'linear-gradient(90deg, #EF4444 0%, #F97316 100%)',
          }}
        />

        {/* 5 Color-Coded Flag Dots */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 16,
            left: 16,
            gap: 4,
            padding: '4px 6px',
            borderRadius: 999,
            background: 'rgba(255, 253, 248, 0.88)',
          }}
        >
          {FLAG_COLORS.map((color) => (
            <div
              key={color}
              style={{
                display: 'flex',
                width: 8,
                height: 8,
                borderRadius: 4,
                background: color,
              }}
            />
          ))}
        </div>

        {/* Lush Mint Parklet Turf Hill */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: -34,
            left: -16,
            width: 212,
            height: 104,
            borderRadius: 104,
            background:
              'linear-gradient(180deg, #4ADE80 0%, #10B981 55%, #059669 100%)',
            border: '4px solid #A7F3D0',
          }}
        />

        {/* Soft Ball Shadow */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 32,
            left: 53,
            width: 74,
            height: 16,
            borderRadius: 8,
            background: 'rgba(6, 78, 59, 0.34)',
          }}
        />

        {/* Sunlit Cream-White Golf Ball */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            marginTop: 20,
            width: 82,
            height: 82,
            borderRadius: 41,
            background:
              'linear-gradient(145deg, #FFFFFF 0%, #FFF9EE 58%, #EAD4B5 100%)',
            border: '3px solid #FFFDF9',
            boxShadow: '0 6px 14px rgba(43, 32, 26, 0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 16,
              left: 22,
              width: 8,
              height: 8,
              borderRadius: 4,
              background: '#E8D5BA',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 14,
              left: 38,
              width: 7,
              height: 7,
              borderRadius: 4,
              background: '#E8D5BA',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 28,
              left: 31,
              width: 9,
              height: 9,
              borderRadius: 5,
              background: '#E5CEAF',
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

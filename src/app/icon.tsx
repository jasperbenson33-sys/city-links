import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

const FLAG_COLORS = ['#EF4444', '#FACC15', '#3B82F6', '#A855F7', '#22C55E'];

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

        {/* Terracotta City Block Silhouette */}
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

        {/* 5 Color-Coded Flag Dots along Top-Left */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 46,
            left: 46,
            gap: 10,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'rgba(255, 253, 248, 0.88)',
          }}
        >
          {FLAG_COLORS.map((color) => (
            <div
              key={color}
              style={{
                display: 'flex',
                width: 22,
                height: 22,
                borderRadius: 11,
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
    }
  );
}

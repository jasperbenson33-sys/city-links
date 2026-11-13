import React, { Suspense } from 'react';
import { QaGalleryStudio } from './QaGalleryStudio';

export default function QaGalleryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#0f1722] text-sm font-medium text-slate-300">
          Loading Curbside Links 3D QA Studio...
        </div>
      }
    >
      <QaGalleryStudio />
    </Suspense>
  );
}

import { lazy, Suspense } from 'react';

// three.js is only downloaded when a globe is on screen.
const Globe = lazy(() => import('./Globe'));

export default function LazyGlobe() {
  return (
    <div className="globe-wrap">
      <Suspense fallback={null}>
        <Globe />
      </Suspense>
    </div>
  );
}

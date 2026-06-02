import dynamic from 'next/dynamic';

export const DynamicParticleField = dynamic(
  () => import('./ParticleField'),
  { ssr: false, loading: () => null }
);

export const DynamicHeroMesh = dynamic(
  () => import('./HeroMesh'),
  { ssr: false, loading: () => <div className="h-44 w-64" /> }
);

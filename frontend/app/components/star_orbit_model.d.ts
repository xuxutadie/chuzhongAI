export type StarOrbitSettingsInput = {
  viewportWidth: number;
  prefersReducedMotion: boolean;
};

export type StarOrbitSettings = {
  starCount: number;
  pixelRatioCap: number;
  motionEnabled: boolean;
};

export function getStarOrbitSettings(input: StarOrbitSettingsInput): StarOrbitSettings;

export type DashboardParticleSettings = {
  particleCount: number;
  pixelRatioCap: number;
  motionEnabled: boolean;
};

export function getDashboardParticleSettings(
  input: StarOrbitSettingsInput
): DashboardParticleSettings;

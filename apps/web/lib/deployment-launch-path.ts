export type DeploymentLaunchPath = 'pump.fun' | 'raydium';
export type DeploymentRoutePlatform = 'pump' | 'raydium';

const DEPLOYMENT_LAUNCH_PATHS = new Set<DeploymentLaunchPath>(['pump.fun', 'raydium']);
const DEPLOYMENT_ROUTE_PLATFORMS = new Set<DeploymentRoutePlatform>(['pump', 'raydium']);

export function normalizeDeploymentLaunchPath(value: unknown, fallback: DeploymentLaunchPath = 'pump.fun'): DeploymentLaunchPath {
  return DEPLOYMENT_LAUNCH_PATHS.has(value as DeploymentLaunchPath) ? value as DeploymentLaunchPath : fallback;
}

export function normalizeDeploymentRoutePlatform(value: unknown, fallback: DeploymentRoutePlatform = 'pump'): DeploymentRoutePlatform {
  return DEPLOYMENT_ROUTE_PLATFORMS.has(value as DeploymentRoutePlatform) ? value as DeploymentRoutePlatform : fallback;
}

export function routePlatformForLaunchPath(launchPath: unknown): DeploymentRoutePlatform {
  return normalizeDeploymentLaunchPath(launchPath) === 'raydium' ? 'raydium' : 'pump';
}

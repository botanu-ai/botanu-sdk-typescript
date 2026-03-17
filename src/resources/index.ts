// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Resource detection using official OTel community detectors.
 *
 * Each detector is a lightweight npm package that auto-detects environment
 * attributes (AWS, GCP, Azure, container). If a package isn't installed,
 * we gracefully skip it.
 *
 * Install detectors for your environment:
 *   npm install @opentelemetry/resource-detector-aws       # EC2/ECS/EKS/Lambda
 *   npm install @opentelemetry/resource-detector-gcp       # GCE/GKE/Cloud Run
 *   npm install @opentelemetry/resource-detector-azure     # Azure VMs/App Service
 *   npm install @opentelemetry/resource-detector-container  # Docker/K8s
 */

interface ResourceDetector {
  detect(): { attributes: Record<string, string> } | Promise<{ attributes: Record<string, string> }>;
}

const DETECTOR_REGISTRY: Array<[string, string]> = [
  // Process (built-in to OTel SDK — always available)
  ['@opentelemetry/resources', 'processDetector'],
  // AWS
  ['@opentelemetry/resource-detector-aws', 'awsEc2Detector'],
  ['@opentelemetry/resource-detector-aws', 'awsEcsDetector'],
  ['@opentelemetry/resource-detector-aws', 'awsEksDetector'],
  ['@opentelemetry/resource-detector-aws', 'awsLambdaDetector'],
  // GCP
  ['@opentelemetry/resource-detector-gcp', 'gcpDetector'],
  // Azure
  ['@opentelemetry/resource-detector-azure', 'azureVmDetector'],
  ['@opentelemetry/resource-detector-azure', 'azureAppServiceDetector'],
  // Container
  ['@opentelemetry/resource-detector-container', 'containerDetector'],
];

export function collectDetectors(): ResourceDetector[] {
  const detectors: ResourceDetector[] = [];

  for (const [modulePath, exportName] of DETECTOR_REGISTRY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(modulePath);
      const detector = mod[exportName];
      if (detector) {
        detectors.push(detector);
      }
    } catch {
      // Missing package — silently skip
    }
  }

  return detectors;
}

export function detectResourceAttrs(): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const detector of collectDetectors()) {
    try {
      const resource = detector.detect();
      // Handle both sync and async detectors
      if (resource && 'attributes' in resource) {
        for (const [key, value] of Object.entries(resource.attributes)) {
          attrs[key] = String(value);
        }
      }
    } catch {
      // Detector failures should never break SDK init
    }
  }

  return attrs;
}

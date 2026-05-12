/**
 * Telemetry — stubbed for Soloship.
 *
 * Soloship has no telemetry pipeline (deliberate: see plan
 * 2026-05-11-rebuild-gs-browse-for-soloship.md). The upstream gstack
 * module logged events to ~/.gstack/analytics/. Here we keep the same
 * export surface so callers (`cdp-bridge.ts`, `domain-skill-commands.ts`)
 * don't need import changes, but every call is a no-op.
 */

export interface TelemetryEvent {
  event: string;
  [key: string]: unknown;
}

/** No-op. Soloship does not emit telemetry. */
export function logTelemetry(_payload: TelemetryEvent): void {
  // intentionally empty
}

/** Test-only: reset cached state. No state to reset; kept for upstream test compat. */
export function _resetTelemetryCache(): void {
  // intentionally empty
}

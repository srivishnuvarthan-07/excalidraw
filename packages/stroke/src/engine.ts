import { clamp, pointFrom, type LocalPoint } from "@excalidraw/math";

import type { RGBA } from "@excalidraw/common";

import {
  accumulateSegmentBounds,
  createEmptyBoundsAccum,
  finalizeRenderedBounds,
} from "./bounds";

import type { RawSample, StrokeRecord, StrokeSegment } from "./types";

export type StrokeEngineConfig = Readonly<{
  /** Input sample coordinate space. */
  inputCoordSpace: "cssPx" | "devicePx";
  /** Device pixel ratio used to convert css -> device. Ignored if inputCoordSpace="devicePx". */
  dpr: number;

  /** Diameter (in CSS px) at p=1.0 before multiplying by dpr. */
  sizeCssPx: number;
  /** Minimum pressure clamp. */
  minPressure: number;

  /** Feather fringe beyond the radius in device px. */
  softnessPx: number;

  /** Optional low-pass smoothing coefficient in [0..1]. 0 => no smoothing. */
  smoothing: number;

  /** Color for emitted segments. */
  color: RGBA;
}>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const dist = (a: LocalPoint, b: LocalPoint) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
};

const normalizeSamplesToDevicePx = (
  samples: readonly RawSample[],
  cfg: StrokeEngineConfig,
): RawSample[] => {
  if (cfg.inputCoordSpace === "devicePx") {
    return samples.slice();
  }
  const dpr = cfg.dpr;
  return samples.map((s) => ({ ...s, x: s.x * dpr, y: s.y * dpr }));
};

const smoothSamples = (samples: readonly RawSample[], smoothing: number) => {
  const s = clamp(smoothing, 0, 1);
  if (!samples.length || s === 0) {
    return samples.slice();
  }

  const alpha = 1 - s;
  const out: RawSample[] = [];

  let px = samples[0].x;
  let py = samples[0].y;
  let pp = samples[0].p;

  out.push({ ...samples[0], x: px, y: py, p: pp });

  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i];
    px = lerp(px, cur.x, alpha);
    py = lerp(py, cur.y, alpha);
    pp = lerp(pp, cur.p, alpha);
    out.push({ ...cur, x: px, y: py, p: pp });
  }

  return out;
};

/**
 * Densify the sample stream without discarding input samples.
 *
 * We insert additional samples when the distance between consecutive samples
 * is large relative to the current radius to avoid visual holes, but we never
 * replace the original point stream. Preserving the stream prevents the
 * "dragged last segment" artifact during slow/stationary input.
 */
const densify = (
  samples: readonly RawSample[],
  cfg: StrokeEngineConfig,
): RawSample[] => {
  if (samples.length <= 1) {
    return samples.slice();
  }

  const baseRadiusPx =
    (cfg.sizeCssPx * (cfg.inputCoordSpace === "cssPx" ? cfg.dpr : 1)) / 2;

  const out: RawSample[] = [samples[0]];

  // Conservative: spacing <= 0.5 * radius, and at least 0.75px.
  // Guard against pathological gaps to avoid unbounded allocations.
  const MAX_INSERTED_PER_SEGMENT = 4096;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];

    const ax = prev.x;
    const ay = prev.y;
    const bx = next.x;
    const by = next.y;

    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);

    if (segLen === 0) {
      out.push(next);
      continue;
    }

    const radiusHere = Math.max(
      baseRadiusPx * Math.max(next.p, cfg.minPressure),
      0.5,
    );
    const minStep = Math.max(0.75, radiusHere * 0.5);

    let inserted = 0;
    for (let d = minStep; d < segLen && inserted < MAX_INSERTED_PER_SEGMENT; ) {
      const t = d / segLen;
      out.push({
        x: ax + dx * t,
        y: ay + dy * t,
        t: lerp(prev.t, next.t, t),
        p: lerp(prev.p, next.p, t),
      });
      d += minStep;
      inserted++;
    }

    out.push(next);
  }

  return out;
};

const pressureToRadiusPx = (pressure: number, cfg: StrokeEngineConfig) => {
  const p = Math.max(cfg.minPressure, pressure);
  const baseRadiusPx =
    (cfg.sizeCssPx * (cfg.inputCoordSpace === "cssPx" ? cfg.dpr : 1) * p) / 2;
  return Math.max(0.5, baseRadiusPx);
};

const MAX_RADIUS_DELTA_PER_SEGMENT_PX = 1.0;

export const buildStrokeRecord = (
  rawSamples: readonly RawSample[],
  cfg: StrokeEngineConfig,
): StrokeRecord => {
  const filtered = rawSamples
    .filter(
      (s) =>
        Number.isFinite(s.x) &&
        Number.isFinite(s.y) &&
        Number.isFinite(s.p) &&
        Number.isFinite(s.t),
    )
    // Never drop samples due to pressure; clamp instead so we preserve
    // the original point stream (especially terminal samples).
    .map((s) => ({ ...s, p: Math.max(0.0001, s.p) }));

  const samplesDevice = normalizeSamplesToDevicePx(filtered, cfg);
  //const samplesSmoothed = smoothSamples(samplesDevice, cfg.smoothing);
  const samples = smoothSamples(samplesDevice, cfg.smoothing);
  //const samples = densify(samplesSmoothed, cfg);
  //const samples = densify(samplesDevice, cfg);
  //const samples = samplesDevice;

  const segments: StrokeSegment[] = [];
  const boundsAccum = createEmptyBoundsAccum();

  if (samples.length === 1) {
    const p = pointFrom<LocalPoint>(samples[0].x, samples[0].y);
    const r = pressureToRadiusPx(samples[0].p, cfg);
    const seg: StrokeSegment = {
      a: p,
      b: p,
      ra: r,
      rb: r,
      color: cfg.color,
      softnessPx: cfg.softnessPx,
    };
    segments.push(seg);
    accumulateSegmentBounds(boundsAccum, seg);
  } else {
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      const a = pointFrom<LocalPoint>(prev.x, prev.y);
      const b = pointFrom<LocalPoint>(cur.x, cur.y);

      const ra = pressureToRadiusPx(prev.p, cfg);
      const rb = pressureToRadiusPx(cur.p, cfg);

      // Skip near-zero segments, but ensure we never drop the terminal point.
      // Some input devices report repeated/stationary samples at stroke end.
      if (dist(a, b) < 0.01) {
        if (i === samples.length - 1) {
          const seg: StrokeSegment = {
            a: b,
            b,
            ra: rb,
            rb,
            color: cfg.color,
            softnessPx: cfg.softnessPx,
          };
          segments.push(seg);
          accumulateSegmentBounds(boundsAccum, seg);
        }
        continue;
      }

      const dr = Math.abs(rb - ra);
      const steps = Math.max(
        1,
        Math.ceil(dr / MAX_RADIUS_DELTA_PER_SEGMENT_PX),
      );

      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;

        const ax = a[0] + (b[0] - a[0]) * t0;
        const ay = a[1] + (b[1] - a[1]) * t0;
        const bx = a[0] + (b[0] - a[0]) * t1;
        const by = a[1] + (b[1] - a[1]) * t1;

        const r0 = ra + (rb - ra) * t0;
        const r1 = ra + (rb - ra) * t1;

        const seg: StrokeSegment = {
          a: pointFrom<LocalPoint>(ax, ay),
          b: pointFrom<LocalPoint>(bx, by),
          ra: r0,
          rb: r1,
          color: cfg.color,
          softnessPx: cfg.softnessPx,
        };
        segments.push(seg);
        accumulateSegmentBounds(boundsAccum, seg);
      }
    }
  }

  const bounds = finalizeRenderedBounds(boundsAccum);

  return {
    segments,
    bounds,
    metadata: {
      dpr: cfg.inputCoordSpace === "cssPx" ? cfg.dpr : 1,
      coordSpace: "devicePx",
    },
  };
};

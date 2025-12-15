import {
  clamp,
  smoothstep,
  vector,
  vectorDot,
  type LocalPoint,
} from "@excalidraw/math";

import type {
  RenderedBounds,
  Rgba8Buffer,
  StrokeRecord,
  StrokeSegment,
} from "../types";

import type { StrokeToCanvasCompatibleOptions } from ".";

const distanceToTaperedSegment = (
  p: LocalPoint,
  seg: StrokeSegment,
): { dist: number; u: number; radius: number } => {
  const ax = seg.a[0];
  const ay = seg.a[1];
  const bx = seg.b[0];
  const by = seg.b[1];

  const abx = bx - ax;
  const aby = by - ay;
  const len = Math.hypot(abx, aby);
  if (len <= 1e-5) {
    const radius = Math.max(seg.ra, seg.rb);
    return { dist: Math.hypot(p[0] - ax, p[1] - ay) - radius, u: 0, radius };
  }

  // Axis-aligned coordinates: y along AB, x perpendicular (absolute).
  const ex = abx / len;
  const ey = aby / len;
  const nx = -ey;
  const ny = ex;

  const apx = p[0] - ax;
  const apy = p[1] - ay;
  const y = apx * ex + apy * ey;
  const x = Math.abs(apx * nx + apy * ny);

  const dr = seg.rb - seg.ra;
  const adr = Math.abs(dr);

  // If one cap contains the other along AB, the union degenerates to the larger cap.
  if (adr >= len) {
    if (dr >= 0) {
      return {
        dist: Math.hypot(p[0] - bx, p[1] - by) - seg.rb,
        u: 1,
        radius: seg.rb,
      };
    }
    return {
      dist: Math.hypot(p[0] - ax, p[1] - ay) - seg.ra,
      u: 0,
      radius: seg.ra,
    };
  }

  const k = dr / len;
  const c = Math.sqrt(1 - k * k);

  const t = y + (k * x) / c;
  if (t <= 0) {
    return {
      dist: Math.hypot(p[0] - ax, p[1] - ay) - seg.ra,
      u: 0,
      radius: seg.ra,
    };
  }
  if (t >= len) {
    return {
      dist: Math.hypot(p[0] - bx, p[1] - by) - seg.rb,
      u: 1,
      radius: seg.rb,
    };
  }

  const u = clamp(t / len, 0, 1);
  const radius = seg.ra + (seg.rb - seg.ra) * u;
  const dist = x * c - seg.ra - k * y;
  return { dist, u, radius };
};

const segmentToBoundsLocal = (
  seg: StrokeSegment,
  bounds: RenderedBounds,
): { x0: number; y0: number; x1: number; y1: number } => {
  const ax = seg.a[0];
  const ay = seg.a[1];
  const bx = seg.b[0];
  const by = seg.b[1];

  const maxR = Math.max(seg.ra, seg.rb);
  const len = Math.hypot(bx - ax, by - ay);
  const dr = Math.abs(seg.rb - seg.ra);

  let extent = maxR + seg.softnessPx;
  if (len > 1e-5 && dr > 0 && dr < len) {
    const k = dr / len;
    const c = Math.sqrt(1 - k * k);
    extent = maxR / c + seg.softnessPx;
  }
  extent = Math.ceil(extent);

  const xMin = Math.floor(Math.min(seg.a[0], seg.b[0]) - extent);
  const yMin = Math.floor(Math.min(seg.a[1], seg.b[1]) - extent);
  const xMax = Math.ceil(Math.max(seg.a[0], seg.b[0]) + extent);
  const yMax = Math.ceil(Math.max(seg.a[1], seg.b[1]) + extent);

  const x0 = Math.max(0, xMin - bounds.xMin);
  const y0 = Math.max(0, yMin - bounds.yMin);
  const x1 = Math.min(bounds.width, xMax - bounds.xMin);
  const y1 = Math.min(bounds.height, yMax - bounds.yMin);

  return { x0, y0, x1, y1 };
};

export const rasterizeStrokeCpu = (
  record: StrokeRecord,
  opts: StrokeToCanvasCompatibleOptions = {},
): {
  buffer: Rgba8Buffer;
  bounds: RenderedBounds;
  boundsExact?: RenderedBounds;
} => {
  const bounds = record.bounds;
  const width = bounds.width;
  const height = bounds.height;

  const data = new Uint8ClampedArray(width * height * 4);
  const buffer: Rgba8Buffer = { width, height, data };

  if (!width || !height || !record.segments.length) {
    return { buffer, bounds };
  }

  // premultiplied alpha accumulation (0..255)
  for (const seg of record.segments) {
    const { x0, y0, x1, y1 } = segmentToBoundsLocal(seg, bounds);
    if (x1 <= x0 || y1 <= y0) {
      continue;
    }

    const sr = Math.round(seg.color.r * 255);
    const sg = Math.round(seg.color.g * 255);
    const sb = Math.round(seg.color.b * 255);
    const sa = clamp(seg.color.a, 0, 1);

    for (let y = y0; y < y1; y++) {
      const py = bounds.yMin + y + 0.5;
      for (let x = x0; x < x1; x++) {
        const px = bounds.xMin + x + 0.5;

        const { dist } = distanceToTaperedSegment([px, py] as LocalPoint, seg);

        let coverage = 0;
        if (dist <= 0) {
          coverage = 1;
        } else if (seg.softnessPx > 0) {
          coverage = 1 - smoothstep(0, seg.softnessPx, dist);
        }

        const alpha = clamp(coverage * sa, 0, 1);
        if (alpha <= 0) {
          continue;
        }

        const idx = (y * width + x) * 4;

        const dstA = data[idx + 3] / 255;
        const outA = alpha + dstA * (1 - alpha);

        // premultiplied src
        const srcR = (sr / 255) * alpha;
        const srcG = (sg / 255) * alpha;
        const srcB = (sb / 255) * alpha;

        const dstR = (data[idx + 0] / 255) * dstA;
        const dstG = (data[idx + 1] / 255) * dstA;
        const dstB = (data[idx + 2] / 255) * dstA;

        const outR = srcR + dstR * (1 - alpha);
        const outG = srcG + dstG * (1 - alpha);
        const outB = srcB + dstB * (1 - alpha);

        if (outA > 0) {
          data[idx + 0] = Math.round((outR / outA) * 255);
          data[idx + 1] = Math.round((outG / outA) * 255);
          data[idx + 2] = Math.round((outB / outA) * 255);
          data[idx + 3] = Math.round(outA * 255);
        } else {
          data[idx + 0] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }
  }

  if (!opts.refineBoundsByScan) {
    return { buffer, bounds };
  }

  const alphaThreshold = opts.alphaThreshold ?? 1 / 255;
  const boundsExact = scanBoundsByAlpha(buffer, bounds, alphaThreshold);

  return { buffer, bounds, boundsExact };
};

export const scanBoundsByAlpha = (
  buffer: Rgba8Buffer,
  bounds: RenderedBounds,
  alphaThreshold: number,
): RenderedBounds | undefined => {
  const { width, height, data } = buffer;
  if (!width || !height) {
    return undefined;
  }

  const threshold = Math.max(0, Math.min(1, alphaThreshold)) * 255;

  let xMin = Number.POSITIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let has = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a >= threshold) {
        has = true;
        xMin = Math.min(xMin, x);
        yMin = Math.min(yMin, y);
        xMax = Math.max(xMax, x + 1);
        yMax = Math.max(yMax, y + 1);
      }
    }
  }

  if (!has) {
    return undefined;
  }

  const outXMin = bounds.xMin + xMin;
  const outYMin = bounds.yMin + yMin;
  const outXMax = bounds.xMin + xMax;
  const outYMax = bounds.yMin + yMax;

  return {
    xMin: outXMin,
    yMin: outYMin,
    xMax: outXMax,
    yMax: outYMax,
    width: outXMax - outXMin,
    height: outYMax - outYMin,
  };
};

import { describe, expect, it } from "vitest";

import {
  newFreeDrawElement,
  strokeToCanvasCompatible,
} from "@excalidraw/element";
import { pointFrom, type LocalPoint } from "@excalidraw/math";

import { buildFreedrawStrokeRecord } from "../src/freedraw";

const rand = (seed: number) => {
  // xorshift32
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
};

const makeStroke = (seed: number, n: number) => {
  const r = rand(seed);
  const pts: LocalPoint[] = [];
  const pressures: number[] = [];
  let x = 0;
  let y = 0;

  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const step = 4 + r() * 10;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push(pointFrom<LocalPoint>(x, y));
    pressures.push(0.1 + r() * 0.9);
  }

  return { pts, pressures };
};

describe("stroke bounds", () => {
  it("analytic bounds contain scan-derived bounds", () => {
    for (let s = 1; s <= 15; s++) {
      const { pts, pressures } = makeStroke(1000 + s, 80);
      const el = newFreeDrawElement({
        type: "freedraw",
        x: 0,
        y: 0,
        strokeColor: "#000000",
        opacity: 100,
        strokeWidth: 2 + (s % 3),
        simulatePressure: false,
        points: pts,
        pressures,
      });

      const record = buildFreedrawStrokeRecord(el, {
        dpr: 2,
        coordSpace: "cssPx",
        softnessPx: 1,
        smoothing: 0,
      });

      const result = strokeToCanvasCompatible(record, {
        refineBoundsByScan: true,
        alphaThreshold: 1 / 255,
      });

      const { boundsExact } = result;

      // expect(image!.width).toBe(record.bounds.width);
      // expect(image!.height).toBe(record.bounds.height);

      // If the stroke ended up fully transparent, boundsExact may be undefined.
      if (!boundsExact) {
        continue;
      }

      // containment
      expect(record.bounds.xMin).toBeLessThanOrEqual(boundsExact.xMin);
      expect(record.bounds.yMin).toBeLessThanOrEqual(boundsExact.yMin);
      expect(record.bounds.xMax).toBeGreaterThanOrEqual(boundsExact.xMax);
      expect(record.bounds.yMax).toBeGreaterThanOrEqual(boundsExact.yMax);

      // tightness (allow small slack)
      const slackLeft = boundsExact.xMin - record.bounds.xMin;
      const slackTop = boundsExact.yMin - record.bounds.yMin;
      const slackRight = record.bounds.xMax - boundsExact.xMax;
      const slackBottom = record.bounds.yMax - boundsExact.yMax;

      expect(slackLeft).toBeGreaterThanOrEqual(0);
      expect(slackTop).toBeGreaterThanOrEqual(0);
      expect(slackRight).toBeGreaterThanOrEqual(0);
      expect(slackBottom).toBeGreaterThanOrEqual(0);

      expect(slackLeft).toBeLessThanOrEqual(2);
      expect(slackTop).toBeLessThanOrEqual(2);
      expect(slackRight).toBeLessThanOrEqual(2);
      expect(slackBottom).toBeLessThanOrEqual(2);
    }
  });
});

describe("stroke sampling", () => {
  it("preserves dense input points (no dragging last segment)", () => {
    const pts: LocalPoint[] = [];
    const pressures: number[] = [];

    for (let i = 0; i < 100; i++) {
      pts.push(pointFrom<LocalPoint>(i * 0.01, 0));
      pressures.push(1);
    }

    const el = newFreeDrawElement({
      type: "freedraw",
      x: 0,
      y: 0,
      strokeColor: "#000000",
      opacity: 100,
      strokeWidth: 2,
      simulatePressure: false,
      points: pts,
      pressures,
    });

    const record = buildFreedrawStrokeRecord(el, {
      dpr: 2,
      coordSpace: "cssPx",
      softnessPx: 1,
      smoothing: 0,
    });

    expect(record.segments.length).toBe(pts.length - 1);
  });
});

import {
  type GlobalPoint,
  type LineSegment,
  lineSegment,
  lineSegmentIntersectionPoints,
  type LocalPoint,
  pointDistanceSq,
  pointFrom,
  pointFromVector,
  vectorAntiNormal,
  vectorFromPoint,
  vectorNormal,
  vectorNormalize,
  vectorScale,
} from "@excalidraw/math";
import { debugDrawLine, debugDrawPoints, hexToRgba } from "@excalidraw/common";

import {
  buildStrokeRecord,
  type CoordSpace,
  type RawSample,
  type StrokeEngineConfig,
  type StrokeRecord,
  strokeToCanvasCompatible,
} from "@excalidraw/stroke";

import type { ExcalidrawFreeDrawElement } from "./types";
import { getFreedrawAsSegments } from "./renderElement";

const offset = (
  x: number,
  y: number,
  pressure: number,
  direction: "left" | "right",
  origin: LocalPoint,
) => {
  const p = pointFrom<LocalPoint>(x, y);
  const v = vectorNormalize(vectorFromPoint(p, origin));
  const normal = direction === "left" ? vectorNormal(v) : vectorAntiNormal(v);
  const scaled = vectorScale(normal, pressure / 2);

  return pointFromVector(scaled, origin);
};

function generateSegments(
  input:
    | readonly [x: number, y: number, pressure: number][]
    | readonly [x: number, y: number][],
  element: ExcalidrawFreeDrawElement,
  pressureMultiplier: number = 1,
  minimumPressure: number = 1,
): LineSegment<LocalPoint>[] {
  if (input.length < 3) {
    return [];
  }

  let idx = 0;
  const segments = Array(input.length * 4 - 4);

  segments[idx++] = lineSegment(
    offset(
      input[1][0],
      input[1][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "left",
      pointFrom<LocalPoint>(input[0][0], input[0][1]),
    ),
    offset(
      input[0][0],
      input[0][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "right",
      pointFrom<LocalPoint>(input[1][0], input[1][1]),
    ),
  );

  for (let i = 2; i < input.length; i++) {
    const a = segments[idx - 1][1];
    const b = offset(
      input[i][0],
      input[i][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "left",
      pointFrom<LocalPoint>(input[i - 1][0], input[i - 1][1]),
    );
    const c = offset(
      input[i - 1][0],
      input[i - 1][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "right",
      pointFrom<LocalPoint>(input[i][0], input[i][1]),
    );

    segments[idx++] = lineSegment(a, b); // Bridge segment
    segments[idx++] = lineSegment(b, c); // Main segment
  }

  // Turnaround segments
  const prev = segments[idx - 1][1];
  segments[idx++] = lineSegment(
    prev,
    pointFrom<LocalPoint>(
      input[input.length - 1][0],
      input[input.length - 1][1],
    ),
  );
  segments[idx++] = lineSegment(
    pointFrom<LocalPoint>(
      input[input.length - 1][0],
      input[input.length - 1][1],
    ),
    offset(
      input[input.length - 2][0],
      input[input.length - 2][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "left",
      pointFrom<LocalPoint>(
        input[input.length - 1][0],
        input[input.length - 1][1],
      ),
    ),
  );

  for (let i = input.length - 2; i > 0; i--) {
    const a = segments[idx - 1][1];
    const b = offset(
      input[i + 1][0],
      input[i + 1][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "right",
      pointFrom<LocalPoint>(input[i][0], input[i][1]),
    );
    const c = offset(
      input[i - 1][0],
      input[i - 1][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "left",
      pointFrom<LocalPoint>(input[i][0], input[i][1]),
    );

    segments[idx++] = lineSegment(a, b); // Main segment
    segments[idx++] = lineSegment(b, c); // Bridge segment
  }

  const last = segments[idx - 1][1];
  segments[idx++] = lineSegment(
    last,
    offset(
      input[1][0],
      input[1][1],
      Math.max((input[1][2] ?? 5) * pressureMultiplier, minimumPressure),
      "right",
      pointFrom<LocalPoint>(input[0][0], input[0][1]),
    ),
  );

  // Closing cap
  segments[idx++] = lineSegment(
    segments[idx - 2][1],
    pointFrom<LocalPoint>(input[0][0], input[0][1]),
  );
  segments[idx++] = lineSegment(
    pointFrom<LocalPoint>(input[0][0], input[0][1]),
    segments[0][0],
  );

  return segments;
}

export function getStroke(
  input:
    | readonly [x: number, y: number, pressure: number][]
    | readonly [x: number, y: number][],
  options: any,
  element: ExcalidrawFreeDrawElement,
): LocalPoint[] {
  const segments: (LineSegment<LocalPoint> | undefined)[] = generateSegments(
    input,
    element,
  );

  const MIN_DIST_SQ = 0.2 ** 2;
  for (let j = 0; j < segments.length; j++) {
    for (let i = j + 1; i < segments.length; i++) {
      const a = segments[j];
      const b = segments[i];
      if (!a || !b) {
        continue;
      }

      const intersection = lineSegmentIntersectionPoints(a, b);

      if (
        intersection &&
        pointDistanceSq(a[0], intersection) > MIN_DIST_SQ &&
        pointDistanceSq(a[1], intersection) > MIN_DIST_SQ &&
        i === j + 2
      ) {
        a[1] = intersection;
        segments[j + 1] = undefined;
        b[0] = intersection;
      }
    }
  }

  // debugSegments(
  //   segments.filter((s): s is LineSegment<LocalPoint> => !!s),
  //   input,
  //   element,
  // );

  return [
    ...(segments[0] ? [segments[0][0]] : []),
    ...segments
      .filter((s): s is LineSegment<LocalPoint> => !!s)
      .map((s) => s[1]),
  ];
}

function debugSegments(
  segments: LineSegment<LocalPoint>[],
  input: readonly [number, number, number][] | readonly [number, number][],
  element: ExcalidrawFreeDrawElement,
): void {
  const colors = [
    "#FF0000",
    "#00FF00",
    "#0000FF",
    // "#FFFF00",
    // "#00FFFF",
    // "#FF00FF",
    // "#C0C0C0",
    // "#800000",
    // "#808000",
    // "#008000",
    // "#800080",
    // "#008080",
    // "#000080",
  ];
  segments.forEach((s, i) => {
    debugDrawLine(
      lineSegment(
        pointFrom<GlobalPoint>(element.x + s[0][0], element.y + s[0][1]),
        pointFrom<GlobalPoint>(element.x + s[1][0], element.y + s[1][1]),
      ),
      { color: colors[i % colors.length], permanent: true },
    );
  });
  input.forEach((p, i) => {
    if (i === 0) {
      return;
    }

    debugDrawLine(
      lineSegment(
        pointFrom<GlobalPoint>(
          element.x + input[i - 1][0],
          element.y + input[i - 1][1],
        ),
        pointFrom<GlobalPoint>(element.x + p[0], element.y + p[1]),
      ),
      { color: "#000000", permanent: true },
    );
  });
}

type FreedrawStrokeBuildOptions = Readonly<{
  dpr: number;
  coordSpace: CoordSpace;
  /** Feather fringe beyond radius, in device px. */
  softnessPx?: number;
  /** Smoothing coefficient in [0..1]. */
  smoothing?: number;
  /** If false, does not bake element.opacity into segment alpha (use context.globalAlpha instead). */
  applyElementOpacity?: boolean;
}>;

export const buildFreedrawStrokeRecord = (
  element: ExcalidrawFreeDrawElement,
  opts: FreedrawStrokeBuildOptions,
): StrokeRecord => {
  const applyElementOpacity = opts.applyElementOpacity ?? true;

  const samples: RawSample[] = [];

  const points = element.points;
  const pressures = element.pressures;

  for (let i = 0; i < points.length; i++) {
    const p = element.simulatePressure ? 1 : pressures[i] ?? 0.5; // TODO: Implement simulated pressure curve
    samples.push({
      x: points[i][0],
      y: points[i][1],
      t: i,
      p: Math.max(0.0001, p),
    });
  }

  if (!samples.length) {
    samples.push({ x: 0, y: 0, t: 0, p: 0.5 });
  }

  const cfg: StrokeEngineConfig = {
    inputCoordSpace: opts.coordSpace,
    dpr: opts.dpr,
    sizeCssPx: element.strokeWidth * 4.25,
    minPressure: element.simulatePressure ? 1 : 0.08,
    softnessPx: opts.softnessPx ?? 1,
    smoothing: opts.smoothing ?? 0.25,
    color: hexToRgba(
      element.strokeColor,
      applyElementOpacity ? element.opacity : 100,
    ),
  };

  return buildStrokeRecord(samples, cfg);
};

/**
 * Draws a high-fidelity stroke into an existing 2D context.
 * The context transform may include rotation/scale.
 */
export const drawFreedrawStrokeToCanvas2D = (
  element: ExcalidrawFreeDrawElement,
  context: CanvasRenderingContext2D,
): void => {
  const t = context.getTransform();
  const scaleX = Math.hypot(t.a, t.b);
  const scaleY = Math.hypot(t.c, t.d);
  const zoom = Math.max(scaleX, scaleY);

  const record = buildFreedrawStrokeRecord(element, {
    dpr: zoom,
    coordSpace: "cssPx",
    applyElementOpacity: false,
    smoothing: 0.85,
    softnessPx: 1.5,
  });

  // debugDrawPoints(
  //   {
  //     points: element.points.slice(10, 20),
  //     x: element.x,
  //     y: element.y,
  //   },
  //   {
  //     permanent: true,
  //   },
  // );

  // debugSegments(
  //   record.segments.map((s) => [s.a, s.b] as LineSegment<LocalPoint>),
  //   [], //element.points,
  //   element,
  // );

  const colors = [
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#00FFFF",
    "#FF00FF",
    //"#C0C0C0",
    //"#800000",
    // "#808000",
    // "#008000",
    // "#800080",
    // "#008080",
    // "#000080",
  ];

  const result = strokeToCanvasCompatible(record);

  // let i = 0;
  // const result = strokeToCanvasCompatible({
  //   ...record,
  //   segments: record.segments.map((segment) => ({
  //     ...segment,
  //     color: hexToRgba(colors[i++ % colors.length], element.opacity),
  //   })),
  // });

  const bounds = result.bounds;

  const dstX = bounds.xMin / zoom;
  const dstY = bounds.yMin / zoom;
  const dstW = bounds.width / zoom;
  const dstH = bounds.height / zoom;

  if (!result.image || dstW <= 0 || dstH <= 0) {
    return;
  }

  if (result.image.kind === "offscreenCanvas") {
    context.drawImage(result.image.canvas, dstX, dstY, dstW, dstH);
    return;
  }

  const imgData =
    result.image.kind === "imageData"
      ? result.image.imageData
      : typeof ImageData !== "undefined"
      ? new ImageData(
          result.image.buffer.data as unknown as ImageDataArray,
          result.image.buffer.width,
          result.image.buffer.height,
        )
      : null;

  if (!imgData) {
    return;
  }

  // ImageData: put into offscreen and drawImage so transforms apply.
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(bounds.width, bounds.height);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.putImageData(imgData, 0, 0);
      context.drawImage(c, dstX, dstY, dstW, dstH);
    }
  }
};

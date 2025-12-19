// import {
//   clamp,
//   normalizeRadians,
//   pointDistance,
//   pointDistanceSq,
//   pointFrom,
//   pointFromPair,
//   pointFromVector,
//   lineSegment,
//   segmentsIntersectAt,
//   PRECISION,
//   vector,
//   vectorAdd,
//   vectorMagnitude,
//   vectorNormalize,
//   vectorRotate,
//   vectorScale,
// } from "@excalidraw/math";

import {
  distanceToLineSegment,
  type LineSegment,
  lineSegment,
  lineSegmentIntersectionPoints,
  type LocalPoint,
  pointFromVector,
  vectorAntiNormal,
  vectorFromPoint,
  vectorNormal,
  vectorNormalize,
  vectorScale,
} from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "./types";

// import type { LocalPoint, Radians, Vector } from "@excalidraw/math";

// import type { ExcalidrawFreeDrawElement } from "./types";

// type Point = [x: number, y: number, r: number];

// const STREAMLINE = 0.45;
// const CORNER_DETECTION_MAX_ANGLE = 75;
// const MIN_SIMULATED_PRESSURE = 0.15;
// const MIN_INPUT_PRESSURE = 0.05;

// const cornerDetectionVariance = (speed: number) => (speed > 35 ? 0.5 : 1);

// const pointFromPressure = (p: Point): LocalPoint => pointFrom(p[0], p[1]);

// const pointWithPressure = (p: LocalPoint, pressure: number): Point => [
//   p[0],
//   p[1],
//   pressure,
// ];

// const vectorBetween = (from: Point, to: Point): Vector =>
//   vector(to[0], to[1], from[0], from[1]);

// const pointAddVector = (p: Point, v: Vector): Point => {
//   const next = pointFromVector<LocalPoint>(v, pointFromPressure(p));
//   return pointWithPressure(next, p[2]);
// };

// const pointLerp = (a: Point, b: Point, t: number): Point => {
//   const next = pointFromVector<LocalPoint>(
//     vectorScale(vectorBetween(a, b), t),
//     pointFromPressure(a),
//   );
//   return pointWithPressure(next, a[2] + (b[2] - a[2]) * t);
// };

// const angleBetween = (p: Point, p1: Point, p2: Point) =>
//   Math.atan2(p2[1] - p[1], p2[0] - p[0]) -
//   Math.atan2(p1[1] - p[1], p1[0] - p[0]);

// const normalizeAngleSigned = (angle: number) => {
//   const normalized = normalizeRadians(angle as Radians);
//   return normalized > Math.PI ? normalized - Math.PI * 2 : normalized;
// };

// const pointDistance3 = (a: Point, b: Point): number =>
//   pointDistance(pointFromPressure(a), pointFromPressure(b));

// const isSamePoint = (a: LocalPoint, b: LocalPoint) =>
//   pointDistanceSq(a, b) <= PRECISION * PRECISION;

// const streamlinePoints = (points: Point[], streamline: number): Point[] => {
//   if (streamline <= 0 || points.length < 2) {
//     return [...points];
//   }

//   const streamlined: Point[] = [points[0]];
//   for (let i = 1; i < points.length; i++) {
//     const prev = streamlined[streamlined.length - 1];
//     streamlined.push(pointLerp(prev, points[i], 1 - streamline));
//   }

//   return streamlined;
// };

// type SimulatedPressureCache = {
//   pressures: number[];
//   totalLength: number;
//   lastPoint: LocalPoint | null;
// };

// const simulatedPressureCache = new WeakMap<
//   ExcalidrawFreeDrawElement,
//   SimulatedPressureCache
// >();

// const simulatePressures = (
//   points: readonly LocalPoint[],
// ): SimulatedPressureCache => {
//   const len = points.length;
//   if (len === 0) {
//     return { pressures: [], totalLength: 0, lastPoint: null };
//   }

//   if (len === 1) {
//     return { pressures: [0.5], totalLength: 0, lastPoint: points[0] };
//   }

//   let total = 0;
//   for (let i = 1; i < len; i++) {
//     total += pointDistance(points[i - 1], points[i]);
//   }
//   const avg = total / Math.max(1, len - 1) || 1;

//   const pressures = new Array<number>(len);
//   for (let i = 0; i < len; i++) {
//     const prev = points[i - 1] ?? points[i];
//     const next = points[i + 1] ?? points[i];
//     const speed =
//       (pointDistance(prev, points[i]) + pointDistance(points[i], next)) / 2;
//     const normalized = avg === 0 ? 0 : speed / (avg * 3);
//     const speedFactor = clamp(1 - normalized, MIN_SIMULATED_PRESSURE, 1);
//     const t = len === 1 ? 0 : i / (len - 1);
//     const taper = Math.sin(Math.PI * t);
//     pressures[i] = clamp(
//       MIN_SIMULATED_PRESSURE +
//         (1 - MIN_SIMULATED_PRESSURE) * speedFactor * taper,
//       MIN_SIMULATED_PRESSURE,
//       1,
//     );
//   }

//   return { pressures, totalLength: total, lastPoint: points[len - 1] };
// };

// const getPressurePoints = (element: ExcalidrawFreeDrawElement): Point[] => {
//   if (!element.points.length) {
//     return [[0, 0, 0.5]];
//   }

//   if (!element.simulatePressure) {
//     return element.points.map(([x, y], index) => {
//       const pressure = clamp(
//         element.pressures[index] ??
//           element.pressures[element.pressures.length - 1] ??
//           0.5,
//         MIN_INPUT_PRESSURE,
//         1,
//       );
//       return [x, y, pressure];
//     });
//   }

//   const cached = simulatedPressureCache.get(element);
//   const points = element.points;

//   const hasPrefixChange =
//     cached &&
//     cached.pressures.length > 0 &&
//     points[cached.pressures.length - 1] &&
//     cached.lastPoint &&
//     (points[cached.pressures.length - 1][0] !== cached.lastPoint[0] ||
//       points[cached.pressures.length - 1][1] !== cached.lastPoint[1]);

//   if (!cached || cached.pressures.length > points.length || hasPrefixChange) {
//     const next = simulatePressures(points);
//     simulatedPressureCache.set(element, next);
//     return points.map(([x, y], index) => [x, y, next.pressures[index] ?? 0.5]);
//   }

//   if (cached.pressures.length < points.length) {
//     let totalLength = cached.totalLength;
//     for (let i = cached.pressures.length; i < points.length; i++) {
//       if (i > 0) {
//         totalLength += pointDistance(points[i - 1], points[i]);
//       }
//     }

//     const avg = totalLength / Math.max(1, points.length - 1) || 1;
//     const startIndex = Math.max(0, cached.pressures.length - 1);
//     for (let i = startIndex; i < points.length; i++) {
//       const prev = points[i - 1] ?? points[i];
//       const next = points[i + 1] ?? points[i];
//       const speed =
//         (pointDistance(prev, points[i]) + pointDistance(points[i], next)) / 2;
//       const normalized = avg === 0 ? 0 : speed / (avg * 3);
//       const speedFactor = clamp(1 - normalized, MIN_SIMULATED_PRESSURE, 1);
//       const t = points.length === 1 ? 0 : i / (points.length - 1);
//       const taper = Math.sin(Math.PI * t);
//       cached.pressures[i] = clamp(
//         MIN_SIMULATED_PRESSURE +
//           (1 - MIN_SIMULATED_PRESSURE) * speedFactor * taper,
//         MIN_SIMULATED_PRESSURE,
//         1,
//       );
//     }
//     cached.totalLength = totalLength;
//     cached.lastPoint = points[points.length - 1];
//   }

//   if (cached.lastPoint !== points[points.length - 1]) {
//     cached.lastPoint = points[points.length - 1] ?? null;
//   }

//   return points.map(([x, y], index) => [x, y, cached.pressures[index] ?? 0.5]);
// };

// type StrokeOutlineParts = {
//   outline: Point[];
//   startCapLength: number;
//   forwardLength: number;
//   endCapLength: number;
//   backwardLength: number;
//   splitIndex: number;
// };

// const getStrokeOutline = (points: Point[], size: number): Point[] =>
//   getStrokeOutlineParts(points, size).outline;

// const getStrokeOutlineParts = (
//   points: Point[],
//   size: number,
// ): StrokeOutlineParts => {
//   if (!points.length) {
//     return {
//       outline: [],
//       startCapLength: 0,
//       forwardLength: 0,
//       endCapLength: 0,
//       backwardLength: 0,
//       splitIndex: 0,
//     };
//   }

//   const len = points.length;

//   if (len === 1) {
//     const c = points[0];
//     const cSize = size * c[2];

//     if (cSize < 0.5) {
//       return {
//         outline: [],
//         startCapLength: 0,
//         forwardLength: 0,
//         endCapLength: 0,
//         backwardLength: 0,
//         splitIndex: 0,
//       };
//     }

//     const outline: Point[] = [];
//     const unit = vector(1, 0);
//     for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 16) {
//       outline.push(
//         pointAddVector(
//           c,
//           vectorScale(vectorRotate(unit, theta as Radians), cSize),
//         ),
//       );
//     }
//     outline.push(pointAddVector(c, vectorScale(unit, cSize)));
//     return {
//       outline,
//       startCapLength: outline.length,
//       forwardLength: 0,
//       endCapLength: 0,
//       backwardLength: 0,
//       splitIndex: outline.length,
//     };
//   }

//   if (len === 2) {
//     const c = points[0];
//     const n = points[1];

//     const cSize = size * c[2];
//     const nSize = size * n[2];

//     if (cSize < 0.5 || nSize < 0.5) {
//       return {
//         outline: [],
//         startCapLength: 0,
//         forwardLength: 0,
//         endCapLength: 0,
//         backwardLength: 0,
//         splitIndex: 0,
//       };
//     }

//     const outline: Point[] = [];
//     const pAngle = angleBetween(c, [c[0], c[1] - 100, c[2]] as Point, n);

//     for (let theta = pAngle; theta <= Math.PI + pAngle; theta += Math.PI / 16) {
//       outline.push(
//         pointAddVector(
//           c,
//           vectorScale(vectorRotate(vector(1, 0), theta as Radians), cSize),
//         ),
//       );
//     }

//     for (
//       let theta = Math.PI + pAngle;
//       theta <= Math.PI * 2 + pAngle;
//       theta += Math.PI / 16
//     ) {
//       outline.push(
//         pointAddVector(
//           n,
//           vectorScale(vectorRotate(vector(1, 0), theta as Radians), nSize),
//         ),
//       );
//     }

//     outline.push(outline[0]);
//     return {
//       outline,
//       startCapLength: outline.length,
//       forwardLength: 0,
//       endCapLength: 0,
//       backwardLength: 0,
//       splitIndex: outline.length,
//     };
//   }

//   const forwardPoints: Point[] = [];
//   const backwardPoints: Point[] = [];

//   let speed = 0;
//   let prevSpeed = 0;
//   let visibleStartIndex = 0;
//   for (let i = 1; i < len - 1; i++) {
//     const p = points[i - 1];
//     const c = points[i];
//     const n = points[i + 1];

//     const d = pointDistance3(p, c);
//     speed = prevSpeed + (d - prevSpeed) * 0.2;

//     const cSize = size * c[2];
//     if (cSize === 0) {
//       visibleStartIndex = i + 1;
//       continue;
//     }

//     const dirPC = vectorNormalize(vectorBetween(c, p));
//     const dirNC = vectorNormalize(vectorBetween(c, n));
//     const p1dirPC = vectorRotate(dirPC, (Math.PI / 2) as Radians);
//     const p2dirPC = vectorRotate(dirPC, (-Math.PI / 2) as Radians);
//     const p1dirNC = vectorRotate(dirNC, (Math.PI / 2) as Radians);
//     const p2dirNC = vectorRotate(dirNC, (-Math.PI / 2) as Radians);

//     const p1PC = pointAddVector(c, vectorScale(p1dirPC, cSize));
//     const p2PC = pointAddVector(c, vectorScale(p2dirPC, cSize));
//     const p1NC = pointAddVector(c, vectorScale(p1dirNC, cSize));
//     const p2NC = pointAddVector(c, vectorScale(p2dirNC, cSize));

//     const ftdir = vectorAdd(p1dirPC, p2dirNC);
//     const btdir = vectorAdd(p2dirPC, p1dirNC);

//     const paPC = pointAddVector(
//       c,
//       vectorScale(
//         vectorMagnitude(ftdir) === 0 ? dirPC : vectorNormalize(ftdir),
//         cSize,
//       ),
//     );
//     const paNC = pointAddVector(
//       c,
//       vectorScale(
//         vectorMagnitude(btdir) === 0 ? dirNC : vectorNormalize(btdir),
//         cSize,
//       ),
//     );

//     const cAngle = normalizeAngleSigned(angleBetween(c, p, n));
//     const D_ANGLE =
//       (CORNER_DETECTION_MAX_ANGLE / 180) *
//       Math.PI *
//       cornerDetectionVariance(speed);

//     if (Math.abs(cAngle) < D_ANGLE) {
//       const tAngle = Math.abs(normalizeAngleSigned(Math.PI - cAngle));

//       if (tAngle === 0) {
//         continue;
//       }

//       if (cAngle < 0) {
//         backwardPoints.push(p2PC, paNC);

//         for (let theta = 0; theta <= tAngle; theta += tAngle / 4) {
//           forwardPoints.push(
//             pointAddVector(
//               c,
//               vectorRotate(vectorScale(p1dirPC, cSize), theta as Radians),
//             ),
//           );
//         }

//         for (let theta = tAngle; theta >= 0; theta -= tAngle / 4) {
//           backwardPoints.push(
//             pointAddVector(
//               c,
//               vectorRotate(vectorScale(p1dirPC, cSize), theta as Radians),
//             ),
//           );
//         }

//         backwardPoints.push(paNC, p1NC);
//       } else {
//         forwardPoints.push(p1PC, paPC);

//         for (let theta = 0; theta <= tAngle; theta += tAngle / 4) {
//           backwardPoints.push(
//             pointAddVector(
//               c,
//               vectorRotate(vectorScale(p1dirPC, -cSize), -theta as Radians),
//             ),
//           );
//         }

//         for (let theta = tAngle; theta >= 0; theta -= tAngle / 4) {
//           forwardPoints.push(
//             pointAddVector(
//               c,
//               vectorRotate(vectorScale(p1dirPC, -cSize), -theta as Radians),
//             ),
//           );
//         }
//         forwardPoints.push(paPC, p2NC);
//       }
//     } else {
//       forwardPoints.push(paPC);
//       backwardPoints.push(paNC);
//     }

//     prevSpeed = speed;
//   }

//   if (visibleStartIndex >= len - 2) {
//     return {
//       outline: [],
//       startCapLength: 0,
//       forwardLength: 0,
//       endCapLength: 0,
//       backwardLength: 0,
//       splitIndex: 0,
//     };
//   }

//   const first = points[visibleStartIndex];
//   const second = points[visibleStartIndex + 1];
//   const penultimate = points[len - 2];
//   const ultimate = points[len - 1];

//   const dirFS = vectorNormalize(vectorBetween(first, second));
//   const dirPU = vectorNormalize(vectorBetween(ultimate, penultimate));

//   const ppdirFS = vectorRotate(dirFS, (-Math.PI / 2) as Radians);
//   const ppdirPU = vectorRotate(dirPU, (Math.PI / 2) as Radians);

//   const startCapSize = size * first[2];
//   const startCap: Point[] = [];

//   const endCapSize = size * penultimate[2];
//   const endCap: Point[] = [];

//   if (startCapSize > 1) {
//     for (let theta = 0; theta <= Math.PI; theta += Math.PI / 16) {
//       startCap.unshift(
//         pointAddVector(
//           first,
//           vectorRotate(vectorScale(ppdirFS, startCapSize), -theta as Radians),
//         ),
//       );
//     }
//     startCap.unshift(
//       pointAddVector(first, vectorScale(ppdirFS, -startCapSize)),
//     );
//   } else {
//     startCap.push(first);
//   }

//   for (let theta = 0; theta <= Math.PI * 3; theta += Math.PI / 16) {
//     endCap.push(
//       pointAddVector(
//         ultimate,
//         vectorRotate(vectorScale(ppdirPU, -endCapSize), -theta as Radians),
//       ),
//     );
//   }

//   const endCapOutline = endCap.slice().reverse();
//   const backwardOutline = backwardPoints.slice().reverse();
//   const outline = [
//     ...startCap,
//     ...forwardPoints,
//     ...endCapOutline,
//     ...backwardOutline,
//   ];
//   const splitIndex =
//     startCap.length + forwardPoints.length + endCapOutline.length;

//   if (startCap.length > 0) {
//     outline.push(startCap[0]);
//   }

//   return {
//     outline,
//     startCapLength: startCap.length,
//     forwardLength: forwardPoints.length,
//     endCapLength: endCapOutline.length,
//     backwardLength: backwardOutline.length,
//     splitIndex,
//   };
// };

// const splitSelfIntersectingOutline = (
//   points: readonly LocalPoint[],
// ): LocalPoint[][] => {
//   if (points.length < 4) {
//     return [points.slice()];
//   }

//   const isClosed =
//     points.length > 1 && isSamePoint(points[0], points[points.length - 1]);
//   const outline = isClosed ? points.slice(0, -1) : points.slice();

//   const polygons: LocalPoint[][] = [];
//   let current: LocalPoint[] = [pointFromPair(outline[0])];

//   for (let i = 1; i < outline.length; i++) {
//     const curr = pointFromPair<LocalPoint>(outline[i]);
//     const prev = current[current.length - 1];
//     let intersection: LocalPoint | null = null;
//     let intersectionIndex = -1;
//     let intersectionDistance = Infinity;

//     for (let j = 1; j < current.length - 1; j++) {
//       const a = current[j - 1];
//       const b = current[j];
//       const hit = segmentsIntersectAt(
//         lineSegment<LocalPoint>(prev, curr),
//         lineSegment<LocalPoint>(a, b),
//       );
//       if (
//         hit &&
//         !isSamePoint(hit, prev) &&
//         !isSamePoint(hit, curr) &&
//         !isSamePoint(hit, a) &&
//         !isSamePoint(hit, b)
//       ) {
//         const distance = pointDistance(prev, hit);
//         if (distance < intersectionDistance) {
//           intersection = hit;
//           intersectionIndex = j;
//           intersectionDistance = distance;
//         }
//       }
//     }

//     if (intersection) {
//       const head = current.slice(0, intersectionIndex);
//       const tail = current.slice(intersectionIndex);
//       const loop = [intersection, ...tail, curr, intersection];

//       if (loop.length >= 4) {
//         polygons.push(loop);
//       }

//       current = [...head, intersection, curr];
//       continue;
//     }

//     current.push(curr);
//   }

//   if (current.length > 1) {
//     current.push(current[0]);
//     polygons.push(current);
//   }

//   return polygons;
// };

// const getStridePairIndex = (
//   index: number,
//   startCapLength: number,
//   forwardLength: number,
//   splitIndex: number,
//   backwardLength: number,
// ) => {
//   const forwardStart = startCapLength;
//   const backwardStart = splitIndex;

//   if (forwardLength !== backwardLength) {
//     return null;
//   }

//   if (index >= forwardStart && index < forwardStart + forwardLength) {
//     const offset = index - forwardStart;
//     return backwardStart + (forwardLength - 1 - offset);
//   }

//   if (index >= backwardStart && index < backwardStart + backwardLength) {
//     const offset = index - backwardStart;
//     return forwardStart + (backwardLength - 1 - offset);
//   }

//   return null;
// };

// const closeFreedrawPolygonByStride = (
//   outline: readonly LocalPoint[],
//   startIndex: number,
//   endIndex: number,
//   startCapLength: number,
//   forwardLength: number,
//   splitIndex: number,
//   backwardLength: number,
// ): LocalPoint[] => {
//   const indices: number[] = [];
//   for (let i = startIndex; i <= endIndex; i++) {
//     indices.push(i);
//   }

//   const pairIndices = indices
//     .map((index) =>
//       getStridePairIndex(
//         index,
//         startCapLength,
//         forwardLength,
//         splitIndex,
//         backwardLength,
//       ),
//     )
//     .filter((index): index is number => index !== null)
//     .reverse();

//   const polygon = [
//     ...indices.map((index) => outline[index]),
//     ...pairIndices.map((index) => outline[index]),
//   ];

//   if (
//     polygon.length > 1 &&
//     !isSamePoint(polygon[0], polygon[polygon.length - 1])
//   ) {
//     polygon.push(polygon[0]);
//   }

//   return polygon;
// };

// const splitSelfIntersectingOutlineByStride = (
//   outline: readonly LocalPoint[],
//   startCapLength: number,
//   forwardLength: number,
//   splitIndex: number,
//   backwardLength: number,
// ): LocalPoint[][] => {
//   if (outline.length < 4 || forwardLength !== backwardLength) {
//     return splitSelfIntersectingOutline(outline);
//   }

//   const polygons: LocalPoint[][] = [];
//   const currentIndices: number[] = [0];

//   const forwardLimit = Math.min(splitIndex, outline.length);
//   for (let i = 1; i < forwardLimit; i++) {
//     const prevIndex = currentIndices[currentIndices.length - 1];
//     const prev = outline[prevIndex];
//     const curr = outline[i];
//     let intersectionIndex = -1;
//     let intersectionDistance = Infinity;

//     for (let j = 1; j < currentIndices.length - 1; j++) {
//       const aIndex = currentIndices[j - 1];
//       const bIndex = currentIndices[j];
//       const a = outline[aIndex];
//       const b = outline[bIndex];
//       const hit = segmentsIntersectAt(
//         lineSegment<LocalPoint>(prev, curr),
//         lineSegment<LocalPoint>(a, b),
//       );
//       if (
//         hit &&
//         !isSamePoint(hit, prev) &&
//         !isSamePoint(hit, curr) &&
//         !isSamePoint(hit, a) &&
//         !isSamePoint(hit, b)
//       ) {
//         const distance = pointDistance(prev, hit);
//         if (distance < intersectionDistance) {
//           intersectionIndex = bIndex;
//           intersectionDistance = distance;
//         }
//       }
//     }

//     if (intersectionIndex !== -1) {
//       const polygon = closeFreedrawPolygonByStride(
//         outline,
//         intersectionIndex,
//         i,
//         startCapLength,
//         forwardLength,
//         splitIndex,
//         backwardLength,
//       );
//       if (polygon.length >= 4) {
//         polygons.push(polygon);
//       }
//       currentIndices.splice(0, currentIndices.length, intersectionIndex, i);
//       continue;
//     }

//     currentIndices.push(i);
//   }

//   if (currentIndices.length > 1) {
//     const polygon = closeFreedrawPolygonByStride(
//       outline,
//       currentIndices[0],
//       currentIndices[currentIndices.length - 1],
//       startCapLength,
//       forwardLength,
//       splitIndex,
//       backwardLength,
//     );
//     if (polygon.length >= 4) {
//       polygons.push(polygon);
//     }
//   }

//   return polygons;
// };

// export const getFreedrawOutlinePoints = (
//   element: ExcalidrawFreeDrawElement,
// ): [number, number][] => {
//   const points = streamlinePoints(getPressurePoints(element), STREAMLINE);
//   const outline = getStrokeOutline(points, element.strokeWidth * 4.25);

//   return outline.map((point) => [point[0], point[1]]);
// };

// export const getFreedrawOutlinePolygons = (
//   element: ExcalidrawFreeDrawElement,
// ): [number, number][][] => {
//   const points = streamlinePoints(getPressurePoints(element), STREAMLINE);
//   const outlineParts = getStrokeOutlineParts(
//     points,
//     element.strokeWidth * 4.25,
//   );
//   const outlinePoints = outlineParts.outline.map((point) =>
//     pointFrom<LocalPoint>(point[0], point[1]),
//   );

//   return splitSelfIntersectingOutlineByStride(
//     outlinePoints,
//     outlineParts.startCapLength,
//     outlineParts.forwardLength,
//     outlineParts.splitIndex,
//     outlineParts.backwardLength,
//   ).map((polygon) => polygon.map((point) => [point[0], point[1]]));
// };

const detectSelfIntersection = (
  stride: LocalPoint[],
  segment: LineSegment<LocalPoint>,
) => {
  return stride.findIndex((p, i) => {
    if (i === stride.length - 1) {
      return false;
    }
    const a = lineSegment(stride[i], stride[i + 1]);
    return lineSegmentIntersectionPoints(a, segment);
  });
};

const cutUpStrideAtIntersections = (
  left: LocalPoint[],
  right: LocalPoint[],
): [LocalPoint[][], LocalPoint[][]] => {
  const collectSelfIntersectionIndices = (stride: LocalPoint[]) => {
    const indices = new Set<number>();
    for (let i = 0; i < stride.length - 1; i++) {
      const segment = lineSegment(stride[i], stride[i + 1]);
      for (let j = i + 2; j < stride.length - 1; j++) {
        const otherSegment = lineSegment(stride[j], stride[j + 1]);
        if (lineSegmentIntersectionPoints(segment, otherSegment)) {
          indices.add(i);
          indices.add(j);
        }
      }
    }
    return indices;
  };

  const intersectionIndices = new Set<number>();
  for (let r = 0; r < right.length - 1; r++) {
    const intersectionIndex = detectSelfIntersection(
      left,
      lineSegment(right[r], right[r + 1]),
    );
    if (intersectionIndex >= 0) {
      intersectionIndices.add(intersectionIndex);
    }
  }

  for (const index of collectSelfIntersectionIndices(left)) {
    intersectionIndices.add(index);
  }
  for (const index of collectSelfIntersectionIndices(right)) {
    intersectionIndices.add(index);
  }

  if (intersectionIndices.size === 0) {
    return [[left], [right]];
  }

  const sortedIndices = Array.from(intersectionIndices).sort((a, b) => a - b);
  const leftStrides: LocalPoint[][] = [];
  const rightStrides: LocalPoint[][] = [];
  let startIndex = 0;
  for (const intersectionIndex of sortedIndices) {
    leftStrides.push(left.slice(startIndex, intersectionIndex));
    rightStrides.push(right.slice(startIndex, intersectionIndex));
    startIndex = intersectionIndex - 1;
  }
  leftStrides.push(left.slice(startIndex));
  rightStrides.push(right.slice(startIndex));

  // if (intersectionIndex !== -1) {
  //   for (let l = 0; l < left.length - 2; l++) {
  //     const [left, right] = cutUpStrideAtIntersections(
  //       leftStrides[l],
  //       rightStrides[l],
  //     );
  //     leftStrides = [
  //       ...leftStrides.slice(0, l - 1),
  //       ...left,
  //       ...leftStrides.slice(l + 1),
  //     ];
  //     rightStrides = [
  //       ...rightStrides.slice(0, l - 1),
  //       ...right,
  //       ...rightStrides.slice(l + 1),
  //     ];
  //   }
  // }

  return [leftStrides, rightStrides];
};

const addCapToOutlinePoints = (
  left: LocalPoint[],
  right: LocalPoint[],
): LocalPoint[] => {
  return [...left, ...right.reverse(), left[0]];
};

const getRadiusFromPressure = (
  pressure: number | undefined,
  prevPoint: LocalPoint,
  nextPoint: LocalPoint,
  strokeWidth: number,
) => {
  return (pressure ?? 1) * strokeWidth * 2;
};

function simplifyPointsForward(
  points: readonly LocalPoint[],
  epsilon: number,
): readonly LocalPoint[] {
  if (epsilon === 0 || points.length <= 2) {
    return points;
  }

  const simplified: LocalPoint[] = [points[0]];
  let anchorIndex = 0;
  let lookaheadIndex = anchorIndex + 1;
  let lastKeptIndex = 0;

  while (lookaheadIndex < points.length - 1) {
    const anchor = points[anchorIndex];
    const lookahead = points[lookaheadIndex];
    const segment = lineSegment(anchor, lookahead);
    let maxDistance = 0;

    for (let i = anchorIndex + 1; i < lookaheadIndex; i++) {
      const distance = distanceToLineSegment(points[i], segment);
      if (distance > maxDistance) {
        maxDistance = distance;
      }
      if (maxDistance > epsilon) {
        break;
      }
    }

    if (maxDistance > epsilon) {
      const newAnchorIndex = lookaheadIndex - 1;
      simplified.push(points[newAnchorIndex]);
      anchorIndex = newAnchorIndex;
      lastKeptIndex = newAnchorIndex;
      lookaheadIndex = anchorIndex + 1;
      continue;
    }

    lookaheadIndex++;
  }

  if (lastKeptIndex !== points.length - 1) {
    simplified.push(points[points.length - 1]);
  }

  return simplified;
}

export const getFreedrawOutlinePoints = (
  element: ExcalidrawFreeDrawElement,
) => {
  return getFreedrawOutlinePolygons(element).flat();
};

export const getFreedrawOutlinePolygons = (
  element: ExcalidrawFreeDrawElement,
): [number, number][][] => {
  const points = simplifyPointsForward(element.points, 0.5);
  const leftOutlinePoints: LocalPoint[] = [];
  const rightOutlinePoints: LocalPoint[] = [];
  for (let i = 0; i < points.length - 2; i++) {
    const radius = getRadiusFromPressure(
      element.pressures[i],
      points[i],
      points[i + 1],
      element.strokeWidth,
    );
    const unit = vectorNormalize(vectorFromPoint(points[i + 1], points[i]));
    const v = vectorScale(unit, radius);

    leftOutlinePoints.push(
      pointFromVector<LocalPoint>(vectorAntiNormal(v), points[i]),
    );
    rightOutlinePoints.push(
      pointFromVector<LocalPoint>(vectorNormal(v), points[i]),
    );
  }

  const [leftStrides, rightStrides] = cutUpStrideAtIntersections(
    leftOutlinePoints,
    rightOutlinePoints,
  );

  const result: [number, number][][] = [];
  for (let i = 0; i < leftStrides.length; i++) {
    if (leftStrides[i].length === 0 || rightStrides[i].length === 0) {
      continue;
    }
    result.push(addCapToOutlinePoints(leftStrides[i], rightStrides[i]));
  }

  return result;
};

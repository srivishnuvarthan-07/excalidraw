import {
  type LineSegment,
  lineSegment,
  lineSegmentIntersectionPoints,
  type LocalPoint,
  pointFrom,
  pointFromVector,
  vector,
  vectorAntiNormal,
  vectorFromPoint,
  vectorNormal,
  vectorNormalize,
  vectorScale,
} from "@excalidraw/math";

import { debugDrawLine } from "@excalidraw/common";

import type { GlobalPoint, Vector } from "@excalidraw/math";

import type { ExcalidrawFreeDrawElement } from "./types";

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

const catmullRom = (
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

const midpoint = (a: LocalPoint, b: LocalPoint): LocalPoint =>
  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as LocalPoint;

const buildRoundedCapPoints = (
  capLeft: LocalPoint,
  capRight: LocalPoint,
  capDir: Vector,
): LocalPoint[] => {
  const center = midpoint(capLeft, capRight);
  const radius = Math.hypot(capLeft[0] - center[0], capLeft[1] - center[1]);
  if (radius === 0) {
    return [capLeft, capRight];
  }

  const leftAngle = Math.atan2(capLeft[1] - center[1], capLeft[0] - center[0]);
  const capDirNorm = vectorNormalize(capDir);
  let sign = 1;
  if (capDirNorm[0] !== 0 || capDirNorm[1] !== 0) {
    const midAngleA = leftAngle + Math.PI / 2;
    const midAngleB = leftAngle - Math.PI / 2;
    const dotA =
      Math.cos(midAngleA) * capDirNorm[0] + Math.sin(midAngleA) * capDirNorm[1];
    const dotB =
      Math.cos(midAngleB) * capDirNorm[0] + Math.sin(midAngleB) * capDirNorm[1];
    sign = dotA >= dotB ? 1 : -1;
  }

  const angles = [
    leftAngle - sign * (Math.PI / 2),
    leftAngle,
    leftAngle + sign * (Math.PI / 2),
    leftAngle + sign * Math.PI,
    leftAngle + sign * (Math.PI * 1.5),
  ];

  const stepsPerSegment = 6;
  const points: LocalPoint[] = [];
  for (let i = 1; i < angles.length - 2; i++) {
    const p0 = angles[i - 1];
    const p1 = angles[i];
    const p2 = angles[i + 1];
    const p3 = angles[i + 2];
    for (let step = 0; step <= stepsPerSegment; step++) {
      if (i > 1 && step === 0) {
        continue;
      }
      const t = step / stepsPerSegment;
      const angle = catmullRom(p0, p1, p2, p3, t);
      points.push(
        pointFrom<LocalPoint>(
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
        ),
      );
    }
  }

  return points;
};

const addCapToOutlinePoints = (
  left: LocalPoint[],
  right: LocalPoint[],
): LocalPoint[] => {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  const getCapDirection = (isStart: boolean): Vector => {
    if (left.length < 2 || right.length < 2) {
      return vector(0, 0);
    }
    const index = isStart ? 0 : left.length - 1;
    const adjacentIndex = isStart ? 1 : left.length - 2;
    const mid = midpoint(left[index], right[index]);
    const adjacentMid = midpoint(left[adjacentIndex], right[adjacentIndex]);
    const dir = isStart
      ? vectorFromPoint(adjacentMid, mid)
      : vectorFromPoint(mid, adjacentMid);
    return vectorNormalize(dir);
  };

  const startDir = getCapDirection(true);
  const endDir = getCapDirection(false);

  const endCap = buildRoundedCapPoints(
    left[left.length - 1],
    right[right.length - 1],
    endDir,
  );
  const startCap = buildRoundedCapPoints(
    left[0],
    right[0],
    vector(-startDir[0], -startDir[1]),
  ).reverse();

  const rightReversed = right.slice().reverse();
  const outline = [
    ...left,
    ...endCap.slice(1, -1),
    ...rightReversed,
    ...startCap.slice(1, -1),
    left[0],
  ];

  return outline;
};

const getRadiusFromPressure = (
  pressure: number | undefined,
  prevPoint: LocalPoint,
  nextPoint: LocalPoint,
  strokeWidth: number,
) => {
  return (pressure ?? 1) * strokeWidth * 2;
};

const streamlinePoints = (
  points: readonly LocalPoint[],
  streamline: number,
): LocalPoint[] => {
  if (streamline <= 0 || points.length < 2) {
    return [...points];
  }

  const streamlined: LocalPoint[] = [points[0]];
  const t = 1 - streamline;
  for (let i = 1; i < points.length; i++) {
    const prev = streamlined[streamlined.length - 1];
    const next: LocalPoint = pointFrom<LocalPoint>(
      prev[0] + (points[i][0] - prev[0]) * t,
      prev[1] + (points[i][1] - prev[1]) * t,
    );
    streamlined.push(next);
  }

  return streamlined;
};

export const getFreedrawOutlinePoints = (
  element: ExcalidrawFreeDrawElement,
) => {
  return getFreedrawOutlinePolygons(element).flat();
};

export const getFreedrawOutlinePolygons = (
  element: ExcalidrawFreeDrawElement,
): [number, number][][] => {
  if (element.points.length < 2) {
    return [];
  }
  const simulatedPressure = element.pressures.length === 0;
  const points = streamlinePoints(element.points, 0.6);
  const leftOutlinePoints: LocalPoint[] = [];
  const rightOutlinePoints: LocalPoint[] = [];
  for (let i = 0; i < points.length - 2; i++) {
    const radius =
      !simulatedPressure && i === 0
        ? getRadiusFromPressure(
            element.pressures[i + 1],
            points[i + 1],
            points[i + 2] ?? points[i + 1],
            element.strokeWidth,
          )
        : !simulatedPressure && points.length > 2 && i === points.length - 1
        ? getRadiusFromPressure(
            element.pressures[i - 1],
            points[i - 1],
            points[i] ?? points[i - 1],
            element.strokeWidth,
          )
        : getRadiusFromPressure(
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

    const COLORS = [
      "#FF0000",
      "#00FF00",
      "#0000FF",
      "#FFFF00",
      "#FF00FF",
      "#00FFFF",
    ];
    if (i > 0 && i < points.length - 2) {
      debugDrawLine(
        lineSegment(
          pointFrom<GlobalPoint>(
            element.x + points[i - 1][0],
            element.y + points[i - 1][1],
          ),
          pointFrom<GlobalPoint>(
            element.x + points[i][0],
            element.y + points[i][1],
          ),
        ),
        { permanent: true, color: COLORS[i % COLORS.length] },
      );
      debugDrawLine(
        lineSegment(
          pointFrom<GlobalPoint>(
            element.x + leftOutlinePoints[i - 1][0],
            element.y + leftOutlinePoints[i - 1][1],
          ),
          pointFrom<GlobalPoint>(
            element.x + leftOutlinePoints[i][0],
            element.y + leftOutlinePoints[i][1],
          ),
        ),
        { permanent: true, color: COLORS[i % COLORS.length] },
      );
      debugDrawLine(
        lineSegment(
          pointFrom<GlobalPoint>(
            element.x + rightOutlinePoints[i - 1][0],
            element.y + rightOutlinePoints[i - 1][1],
          ),
          pointFrom<GlobalPoint>(
            element.x + rightOutlinePoints[i][0],
            element.y + rightOutlinePoints[i][1],
          ),
        ),
        { permanent: true, color: COLORS[i % COLORS.length] },
      );
    }
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

import {
  type GlobalPoint,
  Line,
  type LineSegment,
  lineSegment,
  lineSegmentIntersectionPoints,
  type LocalPoint,
  pointDistance,
  pointDistanceSq,
  pointFrom,
  pointFromVector,
  vectorAntiNormal,
  vectorFromPoint,
  vectorNormal,
  vectorNormalize,
  vectorScale,
} from "@excalidraw/math";

import { type ExcalidrawFreeDrawElement } from "./types";
import { doLineSegmentsIntersect } from "@excalidraw/utils";
import { debugDrawLine, debugDrawPoint, distance } from "@excalidraw/common";

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
): LineSegment<LocalPoint>[] {
  if (input.length < 3) {
    return [];
  }

  let idx = 0;

  //const segments: LineSegment<LocalPoint>[] = [];
  const segments = Array(input.length * 4 - 4);
  segments[idx++] = lineSegment(
    offset(
      input[1][0],
      input[1][1],
      input[1][2] ?? 5,
      "left",
      pointFrom<LocalPoint>(input[0][0], input[0][1]),
    ),
    offset(
      input[0][0],
      input[0][1],
      input[0][2] ?? 5,
      "right",
      pointFrom<LocalPoint>(input[1][0], input[1][1]),
    ),
  );

  for (let i = 2; i < input.length; i++) {
    const a = segments[idx - 1][1];
    const b = offset(
      input[i][0],
      input[i][1],
      input[i][2] ?? 5,
      "left",
      pointFrom<LocalPoint>(input[i - 1][0], input[i - 1][1]),
    );
    const c = offset(
      input[i - 1][0],
      input[i - 1][1],
      input[i - 1][2] ?? 5,
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
      input[input.length - 2][2] ?? 5,
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
      input[i + 1][2] ?? 5,
      "right",
      pointFrom<LocalPoint>(input[i][0], input[i][1]),
    );
    const c = offset(
      input[i - 1][0],
      input[i - 1][1],
      input[i - 1][2] ?? 5,
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
      input[1][2] ?? 5,
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

  const MIN_DIST_SQ = 1 ** 2;
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
        pointDistanceSq(a[1], intersection) > MIN_DIST_SQ
      ) {
        debugDrawPoint(
          pointFrom<GlobalPoint>(
            element.x + intersection[0],
            element.y + intersection[1],
          ),
          { color: "#FF00FF", permanent: true },
        );
        console.log("intersection", j, i, intersection);
      }
      // if (j !== i && j + 1 !== i && j !== i + 1) {
      //   const intersection = lineSegmentIntersectionPoints(segments[j], s);
      //   if (intersection?.length) {
      //     console.log(
      //       "intersection",
      //       j,
      //       i,
      //       pointDistance(segments[j][0], segments[j][1]),
      //       pointDistance(s[0], s[1]),
      //       //lineSegmentIntersectionPoints(segments[j], s),
      //     );
      //   }
      // }
    }
  }

  // for (let i = 0; i < segments.length; i++) {
  //   if (i < 2 || i > segments.length - 3) {
  //     continue;
  //   }

  //   const intersection1 = lineSegmentIntersectionPoints(
  //     segments[i - 2],
  //     segments[i],
  //   );
  //   // if (intersection1) {
  //   //   segments[i][0] = intersection1;
  //   // }

  //   const intersection2 = lineSegmentIntersectionPoints(
  //     segments[i + 2],
  //     segments[i],
  //   );
  //   // if (intersection2) {
  //   //   segments[i][1] = intersection2;
  //   // }

  //   if (!!intersection1 !== !!intersection2) {
  //     console.log("??", intersection1, intersection2);
  //   }
  // }

  debugSegments(segments, input, element);

  return [segments[0][0], ...segments.map((s) => s[1])];
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

#version 300 es
precision highp float;

in vec2 vP;
in vec2 vA;
in vec2 vB;
in float vRa;
in float vRb;
in float vSoft;
in vec4 vColor;

out vec4 outColor;

float clamp01(float x) {
  return clamp(x, 0.0f, 1.0f);
}

float smoothstep01(float t) {
  return t * t * (3.0f - 2.0f * t);
}

float smoothstepRange(float edge0, float edge1, float x) {
  float t = clamp01((x - edge0) / (edge1 - edge0));
  return smoothstep01(t);
}

// Signed distance to a tapered capsule (union of disks along segment AB with
// linearly varying radius).
//
// This is equivalent to a 2D "rounded cone": two circular caps joined by the
// external tangents ("taut belt" around two drums).
float sdTaperedCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ba = b - a;
  float len = length(ba);
  if (len <= 1e-5f) {
    return length(p - a) - max(ra, rb);
  }

  // Axis-aligned coordinates: y along AB, x perpendicular (absolute).
  vec2 e = ba / len;
  vec2 n = vec2(-e.y, e.x);
  vec2 pa = p - a;
  float y = dot(pa, e);
  float x = abs(dot(pa, n));

  float dr = rb - ra;
  float adr = abs(dr);

  // If one cap contains the other along AB, the union degenerates to the larger cap.
  if (adr >= len) {
    return (dr >= 0.0f) ? (length(p - b) - rb) : (length(p - a) - ra);
  }

  float k = dr / len;
  float c = sqrt(1.0f - k * k); // in (0,1]

  // Optimal axial coordinate for the cone side (unclamped).
  float t = y + (k * x) / c;

  if (t <= 0.0f) {
    return length(p - a) - ra;
  }
  if (t >= len) {
    return length(p - b) - rb;
  }

  // Distance to cone side: x*c = ra + k*y at the boundary.
  return x * c - ra - k * y;
}

void main() {
  float d = sdTaperedCapsule(vP, vA, vB, vRa, vRb);

  float coverage = 0.0f;
  if(d <= 0.0f) {
    coverage = 1.0f;
  } else if(vSoft > 0.0f) {
    coverage = 1.0f - smoothstepRange(0.0f, vSoft, d);
  }

  float a = clamp01(coverage * vColor.a);
  if(a <= 0.0f) {
    discard;
  }

  outColor = vec4(vColor.rgb * a, a);
}

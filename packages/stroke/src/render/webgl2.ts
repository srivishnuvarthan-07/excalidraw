import VS from "./vertex.glsl?raw";
import FS from "./fragment.glsl?raw";

import type { StrokeRecord } from "../types";

type SharedWebGL2Renderer = {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uResolution: WebGLUniformLocation;
  uBoundsOrigin: WebGLUniformLocation;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  instanceData: Float32Array;
  instanceCapacity: number;
};

let sharedRenderer: SharedWebGL2Renderer | null = null;

export const isWebGL2Available = (): boolean => {
  return getSharedRenderer() !== null;
};

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("webgl2: failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || "";
    gl.deleteShader(shader);
    throw new Error(`webgl2: shader compile failed: ${info}`);
  }
  return shader;
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
) => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("webgl2: failed to create program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "";
    gl.deleteProgram(program);
    throw new Error(`webgl2: program link failed: ${info}`);
  }

  return program;
};

const FLOATS_PER_INSTANCE = 11;

const ensureInstanceCapacity = (
  renderer: SharedWebGL2Renderer,
  instanceCount: number,
): void => {
  if (renderer.instanceCapacity >= instanceCount) {
    return;
  }
  // Grow exponentially to avoid frequent reallocations.
  const nextCap = Math.max(instanceCount, renderer.instanceCapacity * 2);
  renderer.instanceData = new Float32Array(nextCap * FLOATS_PER_INSTANCE);
  renderer.instanceCapacity = nextCap;
};

const getSharedRenderer = (): SharedWebGL2Renderer | null => {
  if (sharedRenderer) {
    // If the context was lost, drop and recreate.
    if (!sharedRenderer.gl.isContextLost()) {
      return sharedRenderer;
    }
    sharedRenderer = null;
  }

  if (typeof OffscreenCanvas === "undefined") {
    console.error("webgl2: OffscreenCanvas not supported");
    return null;
  }

  try {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      return null;
    }

    const program = createProgram(gl, VS, FS);
    gl.useProgram(program);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uBoundsOrigin = gl.getUniformLocation(program, "uBoundsOrigin");

    if (!uResolution || !uBoundsOrigin) {
      console.error("webgl2: failed to get uniform locations");
      gl.deleteProgram(program);
      return null;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) {
      if (vao) {
        console.error("webgl2: failed to create vertex array");
        gl.deleteVertexArray(vao);
      }
      if (vbo) {
        console.error("webgl2: failed to create buffer");
        gl.deleteBuffer(vbo);
      }
      gl.deleteProgram(program);
      return null;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    // Attribute layout matches shader locations.
    const stride = FLOATS_PER_INSTANCE * 4;
    let off = 0;

    // aA
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(0, 1);
    off += 2 * 4;

    // aB
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(1, 1);
    off += 2 * 4;

    // aRa
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(2, 1);
    off += 1 * 4;

    // aRb
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(3, 1);
    off += 1 * 4;

    // aSoft
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(4, 1);
    off += 1 * 4;

    // aColor
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    sharedRenderer = {
      canvas,
      gl,
      program,
      uResolution,
      uBoundsOrigin,
      vao,
      vbo,
      instanceData: new Float32Array(0),
      instanceCapacity: 0,
    };

    return sharedRenderer;
  } catch {
    sharedRenderer = null;
    return null;
  }
};

export const renderStrokeRecordWebGL2 = (
  record: StrokeRecord,
): OffscreenCanvas | null => {
  if (!record.bounds.width || !record.bounds.height) {
    return new OffscreenCanvas(0, 0);
  }
  const renderer = getSharedRenderer();
  if (!renderer) {
    console.error("webgl2: failed to get renderer");
    return null;
  }

  const { gl } = renderer;
  if (gl.isContextLost()) {
    console.error("webgl2: context lost");
    sharedRenderer = null;
    return null;
  }

  // Resize scratch canvas to stroke bounds.
  if (
    renderer.canvas.width !== record.bounds.width ||
    renderer.canvas.height !== record.bounds.height
  ) {
    renderer.canvas.width = record.bounds.width;
    renderer.canvas.height = record.bounds.height;
  }

  gl.useProgram(renderer.program);
  gl.uniform2f(renderer.uResolution, record.bounds.width, record.bounds.height);
  gl.uniform2f(renderer.uBoundsOrigin, record.bounds.xMin, record.bounds.yMin);

  gl.viewport(0, 0, record.bounds.width, record.bounds.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const instanceCount = record.segments.length;
  if (instanceCount > 0) {
    ensureInstanceCapacity(renderer, instanceCount);

    let idx = 0;
    for (const s of record.segments) {
      renderer.instanceData[idx++] = s.a[0];
      renderer.instanceData[idx++] = s.a[1];
      renderer.instanceData[idx++] = s.b[0];
      renderer.instanceData[idx++] = s.b[1];
      renderer.instanceData[idx++] = s.ra;
      renderer.instanceData[idx++] = s.rb;
      renderer.instanceData[idx++] = s.softnessPx;
      renderer.instanceData[idx++] = s.color.r;
      renderer.instanceData[idx++] = s.color.g;
      renderer.instanceData[idx++] = s.color.b;
      renderer.instanceData[idx++] = s.color.a;
    }

    const sub = renderer.instanceData.subarray(
      0,
      instanceCount * FLOATS_PER_INSTANCE,
    );

    gl.bindVertexArray(renderer.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, sub, gl.DYNAMIC_DRAW);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  return renderer.canvas;
};

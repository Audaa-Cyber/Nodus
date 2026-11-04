"use client";

import React, { CSSProperties, ReactNode, useEffect, useRef } from "react";

export type SatinRidgesProps = {
  colors?: [string, string];
  backgroundColor?: string;
  angle?: number;
  scale?: number;
  depth?: number;
  warp?: number;
  detail?: number;
  gloss?: number;
  highlight?: number;
  sheen?: number;
  lightAngle?: number;
  flow?: number;
  speed?: number;
  interactive?: boolean;
  swell?: number;
  swellRadius?: number;
  clickRipples?: boolean;
  seed?: number;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_body;
uniform vec3 u_sheenColor;
uniform vec3 u_background;
uniform float u_angle;
uniform float u_scale;
uniform float u_depth;
uniform float u_warp;
uniform float u_detail;
uniform float u_gloss;
uniform float u_highlight;
uniform float u_sheen;
uniform float u_lightAngle;
uniform float u_flow;
uniform float u_mouseActive;
uniform vec2 u_mouse;
uniform float u_swell;
uniform float u_swellRadius;
uniform float u_seed;
uniform vec4 u_ripples[8];
uniform float u_rippleCount;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + u_seed);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float a = radians(u_angle);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = rot * p;

  float t = u_time;
  float broad = q.x * max(0.25, u_scale) * 5.2;
  float phase = broad
    + sin(q.y * 3.1 + t * 0.22 * u_flow + u_seed) * 0.75 * u_warp
    + sin(q.y * 7.0 - t * 0.13) * 0.12 * u_warp;
  float wave = sin(phase);
  float fine = sin(phase * 3.1 + q.y * 9.0 + t * 0.38 * u_flow) * 0.12 * u_detail;
  float micro = sin(phase * 7.0 - q.y * 18.0 + t * 0.2) * 0.025 * u_detail;

  vec2 mouseP = (u_mouse - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float md = length(p - mouseP);
  float swellMask = exp(-md * md / max(0.001, u_swellRadius * u_swellRadius));
  float swell = swellMask * u_swell * u_mouseActive * 0.72;
  float ripple = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) < u_rippleCount) {
      vec4 r = u_ripples[i];
      vec2 rp = (r.xy - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
      float d = length(p - rp);
      float ring = exp(-pow((d - r.z * 0.52) * 24.0, 2.0));
      ripple += ring * (1.0 - r.z) * r.w;
    }
  }

  float fabric = wave * (0.5 + clamp(u_depth, 0.0, 2.0) * 0.18) + 0.5;
  fabric += fine + micro + swell * 0.22 + ripple * 0.12;
  float ridge = cos(phase);
  float slope = abs(ridge);
  float lightDir = radians(u_lightAngle);
  float directional = 0.5 + 0.5 * cos(phase + lightDir);
  float tight = mix(1.8, 12.0, clamp(u_gloss, 0.0, 1.0));
  float glint = pow(max(0.0, directional), tight) * u_highlight;
  float softLight = pow(max(0.0, directional), 2.2) * 0.24;
  float foldShade = smoothstep(-1.0, 1.0, fabric * 2.0 - 1.0);
  float valley = 1.0 - smoothstep(0.05, 0.85, slope);
  float shade = clamp(0.22 + foldShade * 0.64 + softLight - valley * 0.17, 0.0, 1.0);

  vec3 base = mix(u_background, u_body, shade);
  float sheenMask = pow(max(0.0, slope), 1.7) * u_sheen;
  vec3 color = mix(base, u_sheenColor, clamp(sheenMask * 0.52, 0.0, 0.72));
  color += vec3(1.0) * glint * 0.55;
  color += u_sheenColor * softLight * 0.14;

  float vignette = smoothstep(1.15, 0.18, length((uv - 0.5) * vec2(1.0, 0.8)));
  color *= 0.76 + vignette * 0.24;
  gl_FragColor = vec4(color, 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function createProgram(gl: WebGLRenderingContext) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Shader compilation failed");
    }
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program linking failed");
  }
  return program;
}

export function SatinRidges({
  colors = ["#2A2A30", "#A1A1B5"],
  backgroundColor = "#050505",
  angle = -20,
  scale = 1,
  depth = 1,
  warp = 1,
  detail = 1,
  gloss = 0.4,
  highlight = 1,
  sheen = 0.5,
  lightAngle = 10,
  flow = 1,
  speed = 1,
  interactive = true,
  swell = 1,
  swellRadius = 0.22,
  clickRipples = true,
  seed = 0,
  paused = false,
  dpr = 1.5,
  className,
  style,
  children,
}: SatinRidgesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "low-power" });
      if (!gl) return;
      const program = createProgram(gl);
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uniform = (name: string) => gl!.getUniformLocation(program, name);
      const uniforms = {
        resolution: uniform("u_resolution"), time: uniform("u_time"), body: uniform("u_body"),
        sheenColor: uniform("u_sheenColor"), background: uniform("u_background"), angle: uniform("u_angle"),
        scale: uniform("u_scale"), depth: uniform("u_depth"), warp: uniform("u_warp"), detail: uniform("u_detail"),
        gloss: uniform("u_gloss"), highlight: uniform("u_highlight"), sheen: uniform("u_sheen"),
        lightAngle: uniform("u_lightAngle"), flow: uniform("u_flow"), mouseActive: uniform("u_mouseActive"),
        mouse: uniform("u_mouse"), swell: uniform("u_swell"), swellRadius: uniform("u_swellRadius"),
        seed: uniform("u_seed"), rippleCount: uniform("u_rippleCount"),
      };
      const rippleLocations = Array.from({ length: 8 }, (_, i) => uniform(`u_ripples[${i}]`));
      const ripples: { x: number; y: number; start: number; strength: number }[] = [];
      const mouse = { x: 0.5, y: 0.5, active: 0 };
      const body = hexToRgb(colors[0]);
      const sheenRgb = hexToRgb(colors[1]);
      const bg = hexToRgb(backgroundColor);
      let width = 1;
      let height = 1;
      let frame = 0;
      let elapsed = 0;
      let previous = 0;
      let visible = true;
      let disposed = false;

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, Math.max(1, dpr));
        width = Math.max(1, Math.floor(rect.width * ratio));
        height = Math.max(1, Math.floor(rect.height * ratio));
        canvas.width = width;
        canvas.height = height;
        gl!.viewport(0, 0, width, height);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const set1 = (loc: WebGLUniformLocation | null, value: number) => { if (loc) gl!.uniform1f(loc, value); };
      const set3 = (loc: WebGLUniformLocation | null, value: number[]) => { if (loc) gl!.uniform3fv(loc, value); };
      const render = (now: number) => {
        if (disposed) return;
        const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
        previous = now;
        if (!paused && visible) elapsed += delta * Math.max(0, speed);
        gl!.useProgram(program);
        if (uniforms.resolution) gl!.uniform2f(uniforms.resolution, width, height);
        set1(uniforms.time, elapsed);
        set3(uniforms.body, body);
        set3(uniforms.sheenColor, sheenRgb);
        set3(uniforms.background, bg);
        set1(uniforms.angle, angle);
        set1(uniforms.scale, scale);
        set1(uniforms.depth, depth);
        set1(uniforms.warp, warp);
        set1(uniforms.detail, detail);
        set1(uniforms.gloss, gloss);
        set1(uniforms.highlight, highlight);
        set1(uniforms.sheen, sheen);
        set1(uniforms.lightAngle, lightAngle);
        set1(uniforms.flow, flow);
        set1(uniforms.mouseActive, mouse.active);
        if (uniforms.mouse) gl!.uniform2f(uniforms.mouse, mouse.x, mouse.y);
        set1(uniforms.swell, swell);
        set1(uniforms.swellRadius, swellRadius);
        set1(uniforms.seed, seed);
        const activeRipples = ripples.filter((r) => elapsed - r.start < 1.25);
        ripples.splice(0, ripples.length, ...activeRipples);
        set1(uniforms.rippleCount, ripples.length);
        rippleLocations.forEach((loc, i) => {
          const r = ripples[i];
          if (loc) gl!.uniform4f(loc, r?.x ?? 0, r?.y ?? 0, r ? (elapsed - r.start) / 1.25 : 0, r?.strength ?? 0);
        });
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
        frame = requestAnimationFrame(render);
      };
      const handleMove = (event: PointerEvent) => {
        if (!interactive) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = (event.clientX - rect.left) / rect.width;
        mouse.y = 1 - (event.clientY - rect.top) / rect.height;
        mouse.active = 1;
      };
      const handleLeave = () => { mouse.active = 0; };
      const handleClick = (event: MouseEvent) => {
        if (!clickRipples) return;
        const rect = canvas.getBoundingClientRect();
        ripples.unshift({
          x: (event.clientX - rect.left) / rect.width,
          y: 1 - (event.clientY - rect.top) / rect.height,
          start: elapsed,
          strength: 1,
        });
        if (ripples.length > 8) ripples.pop();
      };
      const handleVisibility = () => { visible = document.visibilityState === "visible"; };
      canvas.addEventListener("pointermove", handleMove);
      canvas.addEventListener("pointerleave", handleLeave);
      canvas.addEventListener("click", handleClick);
      document.addEventListener("visibilitychange", handleVisibility);
      frame = requestAnimationFrame(render);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("pointermove", handleMove);
        canvas.removeEventListener("pointerleave", handleLeave);
        canvas.removeEventListener("click", handleClick);
        document.removeEventListener("visibilitychange", handleVisibility);
        gl?.deleteBuffer(buffer);
        gl?.deleteProgram(program);
      };
    } catch (error) {
      console.error("SatinRidges WebGL initialization failed:", error);
    }
  }, [colors, backgroundColor, angle, scale, depth, warp, detail, gloss, highlight, sheen, lightAngle, flow, speed, interactive, swell, swellRadius, clickRipples, seed, paused, dpr]);

  return (
    <div ref={hostRef} className={className} style={{ position: "relative", overflow: "hidden", ...style }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {children ? <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>{children}</div> : null}
    </div>
  );
}

export default SatinRidges;

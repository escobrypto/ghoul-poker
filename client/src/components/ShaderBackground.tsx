// ============================================================================
// ShaderBackground — a full-screen WebGL fragment shader that renders animated
// volumetric fog + drifting embers + a neon glow field in the Ghoul palette.
// ADDITIVE + ISOLATED: sits behind all UI (z-index 0, pointer-events none). If
// WebGL is unavailable or the shader fails to compile, it renders nothing and
// the existing CSS background shows through — the game is never affected.
//
// Performance: renders at a capped resolution (fog needs no pixel precision),
// pauses when the tab is hidden, and honors prefers-reduced-motion. Go-big on a
// real GPU, safe on a laptop.
// ============================================================================
import { useEffect, useRef } from 'react';

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;

// hash + value noise (cheap fbm fog)
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;
  float t = u_time * 0.04;

  // layered drifting fog
  float f1 = fbm(p*2.2 + vec2(t, t*0.6));
  float f2 = fbm(p*3.7 - vec2(t*0.8, t*0.3));
  float fog = smoothstep(0.15, 1.0, f1*0.65 + f2*0.4);

  // brand palette: deep violet base -> toxic green wisps -> cyan sparks
  vec3 base   = vec3(0.05, 0.02, 0.10);
  vec3 violet = vec3(0.35, 0.16, 0.55);
  vec3 green  = vec3(0.16, 0.85, 0.44);
  vec3 col = base;
  col = mix(col, violet, fog*0.55);
  col = mix(col, green, pow(f2,3.0)*0.25);

  // radial glow from center-bottom (behind the table/menus)
  vec2 c = uv - vec2(0.5, 0.62);
  c.x *= u_res.x/u_res.y;
  float glow = exp(-dot(c,c)*3.2);
  col += violet * glow * 0.35;

  // drifting embers (sparse bright points that rise)
  float embers = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    vec2 ep = p*vec2(8.0, 6.0) + vec2(fi*13.0, -u_time*(0.25+fi*0.1));
    vec2 gp = fract(ep) - 0.5;
    float id = hash(floor(ep) + fi*7.0);
    float e = smoothstep(0.06, 0.0, length(gp)) * step(0.93, id);
    embers += e;
  }
  col += mix(green, vec3(0.13,0.90,1.0), 0.5) * embers * 0.8;

  // subtle top vignette for depth
  col *= 1.0 - smoothstep(0.4, 1.2, length(uv-vec2(0.5,0.4)))*0.5;

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export default function ShaderBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // respect reduced-motion: skip the animated layer entirely
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return; // no WebGL -> CSS background shows through

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return; // compile failed -> graceful no-op

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // full-screen triangle pair
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');

    // RESOLUTION CAP: render at a downscale (fog is soft; GPU upscales for free).
    // Caps GPU cost on weak devices while looking identical on strong ones.
    const SCALE = 0.6;
    const resize = () => {
      const w = Math.floor(window.innerWidth * SCALE);
      const h = Math.floor(window.innerHeight * SCALE);
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0; const t0 = performance.now();
    let running = true;
    const render = () => {
      if (!running) return;
      const t = (performance.now() - t0) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    render();

    // pause when tab hidden (battery/thermal)
    const onVis = () => {
      running = !document.hidden;
      if (running) render(); else cancelAnimationFrame(raf);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={ref} className="shader-bg" aria-hidden="true" />;
}

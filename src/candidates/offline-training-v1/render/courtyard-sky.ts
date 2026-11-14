import * as THREE from 'three';

/**
 * Presentation-only sky for the courtyard: one shader dome with broad lit and
 * shadowed cloud masses, plus an environment probe derived from that same dome.
 * The dome carries no shadow and never writes depth, so it cannot occlude props,
 * actors or the shadow cascade.
 */
export type CourtyardSky = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  environment: THREE.WebGLRenderTarget | null;
  dispose(): void;
};

const vertexShader = `
varying vec3 vSkyDirection;
void main() {
  vSkyDirection = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Stretch the dome to the far plane; direction stays camera-local to the dome.
  gl_Position = clip.xyww;
}`;

const fragmentShader = `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
varying vec3 vSkyDirection;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.03 + 7.1;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 direction = normalize(vSkyDirection);
  float height = direction.y;

  // Warm haze near the horizon, cool zenith. The lower hemisphere keeps a
  // muted ground bounce so PMREM does not light objects from below with black.
  vec3 colour = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 1.0, height), 0.82));
  colour = mix(uGround, colour, smoothstep(-0.14, 0.045, height));

  // Two cloud fields: broad masses and a finer tonal break-up. Projecting on the
  // XZ plane keeps the cloud scale stable as the camera turns.
  vec2 plane = direction.xz / max(0.16, height + 0.20);
  vec2 broad = plane * 0.40 + vec2(0.7, -0.4);
  vec2 detail = plane * 0.88 + vec2(4.3, 2.1);
  float mass = fbm(broad);
  float breakup = fbm(detail);
  float cloud = smoothstep(0.47, 0.66, mass * 0.82 + breakup * 0.18);
  cloud *= smoothstep(0.015, 0.17, height);
  vec3 cloudTone = mix(vec3(0.27, 0.32, 0.40), vec3(1.14, 1.05, 0.90),
    smoothstep(0.30, 0.78, breakup * 0.65 + mass * 0.35));
  colour = mix(colour, cloudTone, cloud * 0.84);

  // A restrained sun disk and halo make the directional key readable in the
  // sky without turning the whole upper field into a bloom.
  float sun = max(dot(direction, normalize(uSunDirection)), 0.0);
  colour = mix(colour, uSunColor, pow(sun, 4.0) * 0.14);
  colour += uSunColor * pow(sun, 320.0) * 1.35;

  gl_FragColor = vec4(max(colour, vec3(0.0)), 1.0);
}`;

export function createCourtyardSky(renderer: THREE.WebGLRenderer, sunDirection: THREE.Vector3): CourtyardSky {
  const geometry = new THREE.SphereGeometry(70, 40, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(0xbfc8c2) },
      uZenith: { value: new THREE.Color(0x5b84b2) },
      uGround: { value: new THREE.Color(0x7d7769) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uSunDirection: { value: sunDirection.clone().normalize() },
    },
    vertexShader, fragmentShader,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'courtyard-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.noShadow = true;

  let environment: THREE.WebGLRenderTarget | null = null;
  try {
    const probe = new THREE.Scene();
    const source = new THREE.Mesh(geometry, material);
    source.frustumCulled = false;
    probe.add(source);
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(probe, 0, 1, 200);
    pmrem.dispose();
  } catch {
    environment = null;
  }
  return { mesh, environment, dispose() { environment?.dispose(); } };
}

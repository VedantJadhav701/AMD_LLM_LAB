import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices, mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/geometries/RoundedBoxGeometry.js";

const canvas = document.getElementById("lab-scene");
if (!canvas) throw new Error("Landing scene canvas is missing");
const modelUrl = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260929_212926_92423081-b0e4-4f5a-b650-14af6c05c058.glb";
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const backgroundScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.z = 10;
const source = document.createElement("canvas");
const context = source.getContext("2d");
const texture = new THREE.CanvasTexture(source);
texture.colorSpace = THREE.SRGBColorSpace;
texture.minFilter = texture.magFilter = THREE.LinearFilter;
texture.generateMipmaps = false;
const backgroundMaterial = new THREE.ShaderMaterial({
  uniforms: { image: { value: texture } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }",
  fragmentShader: `uniform sampler2D image; varying vec2 vUv;
void main(){ gl_FragColor=texture2D(image,vUv);
#include <colorspace_fragment>
}`,
  depthTest: false, depthWrite: false,
});
const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backgroundMaterial);
background.frustumCulled = false;
backgroundScene.add(background);

const glassVertex = "varying vec3 normalView; varying vec3 eyeView; void main(){ vec4 mv=viewMatrix*modelMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; normalView=normalize(normalMatrix*normal); eyeView=normalize(mv.xyz); }";
const glassFragment = `uniform sampler2D image; uniform vec2 resolution; uniform float darkMode; varying vec3 normalView; varying vec3 eyeView;
void main(){ vec2 uv=gl_FragCoord.xy/resolution; vec3 n=normalize(normalView), eye=normalize(eyeView); vec3 r=texture2D(image,uv+refract(eye,n,1.0/1.15).xy*.34).rgb; vec3 g=texture2D(image,uv+refract(eye,n,1.0/1.19).xy*.39).rgb; vec3 b=texture2D(image,uv+refract(eye,n,1.0/1.22).xy*.44).rgb; vec3 color=vec3(r.r,g.g,b.b); float rim=pow(1.0+dot(eye,n),5.0); color=mix(color,darkMode>.5?vec3(1.0):vec3(.16,.16,.16),rim*.24); color+=vec3(.16,.13,.11)*pow(max(dot(n,normalize(vec3(-1.0,1.0,1.0))),0.0),48.0); gl_FragColor=vec4(color,1.0);
#include <colorspace_fragment>
}`;
const pivot = new THREE.Group();
const spinner = new THREE.Group();
pivot.add(spinner);
scene.add(pivot);
let cube = null;
let isDragging = false;
let lastX = 0, lastY = 0, vx = 0, vy = 0, idle = 1;
let darkMode = false;
let alive = true;
let frame = 0;
let lastTime = performance.now();
let turn = 0;
const front = new THREE.ShaderMaterial({ vertexShader: glassVertex, fragmentShader: glassFragment, uniforms: { image: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, darkMode: { value: 0 } }, side: THREE.FrontSide });
const back = front.clone();
back.side = THREE.BackSide;
back.uniforms.darkMode = front.uniforms.darkMode;
const targets = [];

function drawHeadline() {
  if (!context) return;
  const width = innerWidth, height = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  source.width = Math.max(1, Math.floor(width * dpr));
  source.height = Math.max(1, Math.floor(height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const light = document.querySelector(".landing-shell")?.getAttribute("data-theme") !== "dark";
  darkMode = !light;
  front.uniforms.darkMode.value = darkMode ? 1 : 0;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  const mobile = width < 768 || width / height < 1;
  let size = Math.min(height * .22, width * (mobile ? .22 : .13));
  context.font = `800 ${size}px Poppins, Inter, sans-serif`;
  const words = ["AMD", "LLM", "LAB"];
  const max = width * (mobile ? .9 : .59);
  const widest = Math.max(...words.map((word) => context.measureText(word).width));
  if (widest > max) { size *= max / widest; context.font = `800 ${size}px Poppins, Inter, sans-serif`; }
  context.fillStyle = "#e9e9e9";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const x = width * (mobile ? .5 : .5), y = height * (mobile ? .43 : .47), gap = size * 1.08;
  words.forEach((word, index) => context.fillText(word, x, y + size * .35 + (index - 1) * gap));
  texture.needsUpdate = true;
}

function resize() {
  const w = innerWidth, h = innerHeight, dpr = renderer.getPixelRatio();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dw = Math.max(1, Math.floor(w * dpr)), dh = Math.max(1, Math.floor(h * dpr));
  front.uniforms.resolution.value.set(dw, dh);
  targets.forEach((item) => item.dispose());
  targets.length = 0;
  const options = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  targets.push(new THREE.WebGLRenderTarget(dw, dh, options), new THREE.WebGLRenderTarget(dw, dh, options));
  back.uniforms.image.value = targets[0].texture;
  front.uniforms.image.value = targets[1].texture;
  drawHeadline();
  if (!cube) return;
  const mobile = w < 768 || w / h < 1;
  const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 10;
  const visibleW = visibleH * camera.aspect;
  pivot.position.set((mobile ? 0 : .017) * visibleW, (mobile ? .07 : .012) * visibleH, 0);
  const edge = Math.min(h * .43, w * (mobile ? .46 : .29));
  pivot.scale.setScalar(edge / h * visibleH);
}

function setupGeometry(geometry) {
  geometry.center();
  geometry.computeBoundingBox();
  const bounds = new THREE.Vector3();
  geometry.boundingBox.getSize(bounds);
  const max = Math.max(bounds.x, bounds.y, bounds.z);
  if (max) geometry.scale(1 / max, 1 / max, 1 / max);
  cube = new THREE.Mesh(geometry, front);
  spinner.add(cube);
  resize();
  document.querySelector(".scene-loader")?.classList.add("done");
}

function fallback() { if (alive && !cube) setupGeometry(new RoundedBoxGeometry(1, 1, 1, 8, .12)); }
new GLTFLoader().load(modelUrl, (gltf) => {
  if (!alive) return;
  try {
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const geometry = node.geometry.clone();
      ["uv", "color", "tangent"].forEach((name) => geometry.deleteAttribute(name));
      const merged = mergeVertices(geometry, 1e-4);
      merged.computeVertexNormals();
      merged.applyMatrix4(node.matrixWorld);
      parts.push(merged);
    });
    if (parts.length) setupGeometry(mergeGeometries(parts, false)); else fallback();
  } catch (error) { console.warn("Glass model processing failed; using rounded cube.", error); fallback(); }
}, undefined, fallback);
setTimeout(fallback, 2500);

spinner.rotation.set(-.42, .62, .18);
function rotate(dx, dy) {
  spinner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx));
  spinner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy));
}
canvas.addEventListener("pointerdown", (event) => { isDragging = true; canvas.setPointerCapture(event.pointerId); lastX = event.clientX; lastY = event.clientY; vx = vy = 0; idle = 0; canvas.classList.add("dragging"); });
canvas.addEventListener("pointermove", (event) => { if (!isDragging) return; vx = (event.clientX - lastX) * .008; vy = (event.clientY - lastY) * .008; lastX = event.clientX; lastY = event.clientY; rotate(vx, vy); });
function endDrag() { isDragging = false; idle = 0; canvas.classList.remove("dragging"); }
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
function onTurn(event) { turn += event.detail; vx = vy = 0; idle = 0; }
function onTheme() { drawHeadline(); }
function onDispose() { alive = false; cancelAnimationFrame(frame); removeEventListener("resize", resize); removeEventListener("amd-lab-rotate", onTurn); removeEventListener("amd-lab-theme", onTheme); removeEventListener("amd-lab-scene-dispose", onDispose); targets.forEach((item) => item.dispose()); renderer.dispose(); }
addEventListener("resize", resize);
addEventListener("amd-lab-rotate", onTurn);
addEventListener("amd-lab-theme", onTheme);
addEventListener("amd-lab-scene-dispose", onDispose, { once: true });
Promise.race([Promise.all([document.fonts.load("800 100px Inter"), document.fonts.ready]), new Promise((resolve) => setTimeout(resolve, 2500))]).then(resize);
document.fonts.addEventListener("loadingdone", drawHeadline);

function animate(now) {
  if (!alive) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, .05);
  lastTime = now;
  if (!isDragging) {
    idle += dt;
    if (Math.abs(turn) > .0005) { const step = turn * Math.min(1, .09 * dt * 60); rotate(step, 0); turn -= step; }
    if (Math.abs(vx) + Math.abs(vy) > 1e-5) { rotate(vx, vy); const damp = Math.pow(.94, dt * 60); vx *= damp; vy *= damp; }
    if (idle > .6) { const blend = Math.min(1, (idle - .6)); rotate(.0035 * dt * 60 * blend, .0012 * dt * 60 * blend); }
  }
  if (cube && targets.length === 2) {
    renderer.setRenderTarget(targets[0]); renderer.autoClear = true; renderer.render(backgroundScene, camera);
    renderer.setRenderTarget(targets[1]); renderer.autoClear = true; renderer.render(backgroundScene, camera); renderer.autoClear = false; cube.material = back; renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(backgroundScene, camera); renderer.autoClear = false; renderer.clearDepth(); cube.material = front; renderer.render(scene, camera);
  } else { renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(backgroundScene, camera); }
}
frame = requestAnimationFrame(animate);

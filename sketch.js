// =====================================================================
//  《梦幻星空 · 星座法阵》— 起始文件
//  PART A（下面）是手势识别引擎，不要修改。
//  PART B 已经写好了大部分，只留下 5 个 ★ 标记的函数，
//  每一步让 Agent 写其中一个，替换掉 ★ 标记之间的临时版本。
// =====================================================================


// ---------------------------------------------------------------------
//  PART A — 手势识别引擎（三个项目完全相同，不要修改）
// ---------------------------------------------------------------------
const MP_VERSION = "0.10.21";
// MediaPipe 的两个下载来源：先用国内镜像 npmmirror，失败再用 jsDelivr
const MP_URLS = [
  `https://registry.npmmirror.com/@mediapipe/tasks-vision/${MP_VERSION}/files`,
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`,
];
// 手势模型：先找项目文件夹里的 gesture_recognizer.task，
// 没有的话再从 Google 下载（中国大陆通常无法访问 Google）
const MODEL_URLS = [
  "gesture_recognizer.task",
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
];

// 模型认识的 8 种手势（英文名是模型给出的名字，中文名用来显示）
const GESTURE_NAMES = {
  None: "无",
  Closed_Fist: "握拳 ✊",
  Open_Palm: "张开手掌 🖐",
  Pointing_Up: "食指向上 ☝️",
  Thumb_Down: "拇指向下 👎",
  Thumb_Up: "拇指向上 👍",
  Victory: "剪刀手 ✌️",
  ILoveYou: "我爱你 🤟",
};

let video;                 // 摄像头画面（p5 capture）
let recognizer = null;     // MediaPipe 手势识别模型
let hands = [];            // 每一帧：看到的所有手（0、1 或 2 只）。每只手是一个对象：
                           //   hand.gesture — 手势名，例如 "Open_Palm"（见上面的 GESTURE_NAMES）
                           //   hand.score   — 把握程度，0 到 1（1 = 非常确定）
                           //   hand.points  — 21 个点 {x, y}，画布像素坐标，已经镜像
                           //   hand.side    — "Left" 或 "Right"
let lastVideoTime = -1;
let started = false;
let showCamera = false;

async function loadGestureRecognizer() {
  setStatus("正在加载手势模型…");
  for (const base of MP_URLS) {
    let vision, fileset;
    try {
      vision = await import(`${base}/vision_bundle.mjs`);
      fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    } catch (e) {
      continue; // 这个来源打不开，换下一个
    }
    for (const model of MODEL_URLS) {
      for (const delegate of ["GPU", "CPU"]) { // 有的电脑不能用 GPU，就退回 CPU
        try {
          recognizer = await vision.GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: model, delegate },
            runningMode: "VIDEO",
            numHands: 2,
          });
          return; // 成功！
        } catch (e) {
          // 失败就试下一个
        }
      }
    }
  }
  setStatus("⚠️ 手势模型加载失败：请把 gesture_recognizer.task 放进项目文件夹（和 index.html 放在一起），然后刷新页面");
}

// 每一帧调用一次：向 MediaPipe 要最新的手势和关键点，
// 并把 0~1 的数值换算成镜像后的画布像素坐标。
let cameraOk = null;
function updateHands() {
  if (!recognizer || !video) return;

  // 摄像头没有画面时提示用户（没有授权，或者被别的软件占用）
  const ok = video.elt.readyState >= 2;
  if (ok !== cameraOk) {
    cameraOk = ok;
    setStatus(ok ? "把手伸到摄像头前，做一个手势 ✋"
                 : "正在等待摄像头…请点击「允许」，或点击地址栏里的摄像头图标，然后刷新页面");
  }
  if (!ok) return;

  if (video.elt.currentTime === lastVideoTime) return; // 还没有新的画面
  lastVideoTime = video.elt.currentTime;

  const result = recognizer.recognizeForVideo(video.elt, performance.now());
  const sides = result.handedness || result.handednesses || [];
  hands = result.landmarks.map((lm, i) => {
    const best = (result.gestures[i] && result.gestures[i][0]) || { categoryName: "None", score: 0 };
    return {
      gesture: best.categoryName || "None",
      score: best.score,
      side: sides[i] && sides[i][0] ? sides[i][0].categoryName : "",
      points: lm.map((p) => ({ x: (1 - p.x) * width, y: p.y * height, z: p.z })),
    };
  });
}

// 在每只手的手腕旁边写出识别到的手势和把握程度（学习和调试用）
function drawGestureInfo() {
  push();
  textSize(16);
  textAlign(CENTER, TOP);
  for (const hand of hands) {
    const w = hand.points[0];
    const y = min(w.y + 14, height - 70); // 不要跑到画面外面
    const label = `${GESTURE_NAMES[hand.gesture] || hand.gesture}  ${round(hand.score * 100)}%`;
    noStroke();
    fill(0, 120);
    rect(w.x - textWidth(label) / 2 - 8, y, textWidth(label) + 16, 26, 6);
    fill(255);
    text(label, w.x, y + 4);
  }
  pop();
}

function drawCamera() {
  push();
  translate(width, 0);
  scale(-1, 1); // 镜像，像照镜子一样
  tint(255, 70);
  image(video, 0, 0, width, height);
  pop();
}

function setStatus(msg) {
  select("#status").html(msg);
}


// ---------------------------------------------------------------------
//  PART B — 作品：《梦幻星空 · 星座法阵》
// ---------------------------------------------------------------------

const SKY_DEEP = "#0a0e2a";  // 深邃的蓝黑夜空
const MAX_STARS = 300;       // 星空中星星数量的上限
// C 大调五声音阶（MIDI 编号，两个八度），星星越多，音越高
const STAR_NOTES = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];

let stars = [];        // 星星：{x, y, px, py, homeX, homeY, r, phase, seed, tx, ty, hasTarget}
let magicCircle;       // 法阵：{x, y, R, rot, open}
let zodiacs = [];      // 十二星座（数据来自 constellations.js，这里补上画面坐标和状态）
let current = 0;       // 现在是哪一个星座
let summoned = false;  // 星座是否被召唤（连线是否渐显）
let lastGesture = {};
let showInfo = true;

// 声音：星星的叮声
let chime, chimeEnv;

function setup() {
  createCanvas(windowWidth, windowHeight);
  magicCircle = { x: width / 2, y: height / 2, R: min(width, height) * 0.32, rot: 0, open: false };
  initStars();
  layoutConstellations();
  select("#start").mouseClicked(startExperience);
}

// 铺一片新星空：星星随机散布，各自有大小、闪烁起点和“家”
function initStars() {
  stars = [];
  const n = 240;
  for (let i = 0; i < n; i++) stars.push(newStar(random(width), random(height), random(1.5, 4.5)));
}

function newStar(x, y, r) {
  return {
    x, y, px: x, py: y, homeX: x, homeY: y,
    r, phase: random(TWO_PI), seed: random(1000),
    tx: 0, ty: 0, hasTarget: false,
  };
}

// 把 constellations.js 里 0~1000 的相对坐标等比缩放到画面中央
function layoutConstellations() {
  zodiacs = CONSTELLATIONS.map((c) => ({
    name: c.name,
    latin: c.latin,
    raw: c.nodes,
    links: c.links,
    nodes: [],
    alpha: 0,
    phase: random(TWO_PI),
  }));
  const fit = min(width, height) * 0.62; // 星座整体不超过这个范围
  const cx = width / 2;
  const cy = height / 2;
  for (const z of zodiacs) {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const n of z.raw) {
      minX = min(minX, n[0]);
      maxX = max(maxX, n[0]);
      minY = min(minY, n[1]);
      maxY = max(maxY, n[1]);
    }
    const s = fit / max(maxX - minX, maxY - minY);
    z.nodes = z.raw.map((n) => ({
      x: cx + (n[0] - (minX + maxX) / 2) * s,
      y: cy + (n[1] - (minY + maxY) / 2) * s,
    }));
  }
}

function startExperience() {
  userStartAudio();

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  chime = new p5.Oscillator("sine");
  chime.amp(0);
  chime.start();
  chimeEnv = new p5.Envelope();
  chimeEnv.setADSR(0.003, 1.2, 0, 0.2);
  chimeEnv.setRange(0.3, 0);

  select("#intro").hide();
  started = true;
  loadGestureRecognizer();
}

function draw() {
  // 1. 手势：同一个手势保持不动，只触发一次
  if (started) {
    updateHands();
    for (const hand of hands) {
      const g = hand.score >= 0.6 ? hand.gesture : "None";
      if (g === "None") continue;
      if (g !== lastGesture[hand.side]) onGesture(g, hand);
      lastGesture[hand.side] = g;
    }
    if (hands.length === 0) lastGesture = {};
  }

  // 2. 夜空
  background(SKY_DEEP);
  if (started && showCamera) drawCamera();

  // 3. 星星
  for (const s of stars) {
    updateStar(s);
    drawStar(s);
  }

  // 4. 法阵缓缓旋转
  if (magicCircle.open) magicCircle.rot += 0.06;
  drawMagicCircle(magicCircle);

  // 5. 当前星座：被召唤时渐渐显形，否则悄悄消散
  const z = zodiacs[current];
  if (z) {
    if (summoned) z.alpha = min(1, z.alpha + 0.01);
    else z.alpha = max(0, z.alpha - 0.02);
    drawConstellation(z);
    if (z.alpha > 0.01) {
      noStroke();
      fill(200, 220, 255, 160 * z.alpha);
      textSize(18);
      textAlign(CENTER, CENTER);
      text(`${z.name} · ${z.latin}`, width / 2, height - 32);
    }
  }

  // 6. 食指指尖的小光点 + 手势信息（按 I 显示/隐藏）
  if (started) {
    for (const hand of hands) {
      noStroke();
      fill(255, 230, 120, 200);
      circle(hand.points[8].x, hand.points[8].y, 10);
    }
    if (showInfo) drawGestureInfo();
  }
}

// ★★★★★★ 第 1 步 开始：把这里的 drawStar 函数整个换成 Agent 写的版本 ★★★★★★
function drawStar(s) {
  // 画一颗会闪烁的梦幻星星：几层蓝白色光晕 + 一个亮白色的核 + 一道淡淡的十字光芒
  // 1. pulse 在 0.4 和 1 之间来回摆动，s.phase 让每颗星星的闪烁节奏各不相同
  let pulse = 0.7 + 0.3 * sin(frameCount * 0.06 + s.phase);
  // 2. 大小跟着呼吸一起变化
  let r = s.r * pulse;
  // 3. 光晕不需要描边
  noStroke();
  // 4. 蓝白色光晕：4 个越来越大、越来越透明的圆，叠在一起就像在发光
  for (let i = 4; i >= 1; i--) {
    fill(190, 215, 255, 18);
    circle(s.x, s.y, r * i * 1.8);
  }
  // 5. 亮白色的核
  fill(255, 252, 235);
  circle(s.x, s.y, r);
  // 6. 十字光芒：一横一竖两条很细很淡的线，亮度跟着呼吸走
  stroke(255, 245, 210, 90 * pulse);
  strokeWeight(1);
  line(s.x - r * 2.2, s.y, s.x + r * 2.2, s.y);
  line(s.x, s.y - r * 2.2, s.x, s.y + r * 2.2);
  // 7. 画完把描边关掉，不要影响别的图形
  noStroke();
}
// ★★★★★★ 第 1 步 结束 ★★★★★★

// ★★★★★★ 第 2 步 开始：把这里的 updateStar 函数整个换成 Agent 写的版本 ★★★★★★
function updateStar(s) {
  // 临时版本：星星钉在原地不动
}
// ★★★★★★ 第 2 步 结束 ★★★★★★

// ★★★★★★ 第 3 步 开始：把这里的 drawMagicCircle 函数整个换成 Agent 写的版本 ★★★★★★
function drawMagicCircle(mc) {
  // 临时版本：画面中央一个孤单的灰色圆环
  noFill();
  stroke(140);
  strokeWeight(1);
  circle(mc.x, mc.y, mc.R * 2);
}
// ★★★★★★ 第 3 步 结束 ★★★★★★

// ★★★★★★ 第 4 步 开始：把这里的 drawConstellation 函数整个换成 Agent 写的版本 ★★★★★★
function drawConstellation(c) {
  // 临时版本：星座只是一串看不见的数据，什么都不画
}
// ★★★★★★ 第 4 步 结束 ★★★★★★

// ★★★★★★ 第 5 步 开始：把这里的 onGesture 函数整个换成 Agent 写的版本 ★★★★★★
function onGesture(g, hand) {
  // 临时版本：做手势还没有反应
}
// ★★★★★★ 第 5 步 结束 ★★★★★★

// ---------- 下面这些已经写好了，不需要改 ----------

// ☝️ 在指尖点亮一颗引导星
function spawnGuideStar(x, y) {
  stars.push(newStar(x, y, random(4, 6)));
}

// 👍 召唤：让一部分星星飞向当前星座的恒星位置
function summonConstellation() {
  const z = zodiacs[current];
  if (!z) return;
  const chosen = shuffle([...stars]).slice(0, floor(stars.length * 0.55));
  for (const s of chosen) {
    const n = random(z.nodes);
    s.tx = n.x + random(-8, 8);
    s.ty = n.y + random(-8, 8);
    s.hasTarget = true;
  }
  summoned = true;
}

// ✊ 收拢归寂：星星散开回家，法阵收拢，星座消散
function dismissAll() {
  for (const s of stars) s.hasTarget = false;
  summoned = false;
  magicCircle.open = false;
}

// 🤟 星座消散，切换到下一个星座
function nextConstellation() {
  for (const s of stars) s.hasTarget = false;
  summoned = false;
  current = (current + 1) % zodiacs.length;
}

// ✌️ 换一片新星空
function resetSky() {
  for (const s of stars) s.hasTarget = false;
  summoned = false;
  initStars();
}

// 叮——星星越多，音越高
function playStarNote(n) {
  if (!chime) return;
  const i = constrain(floor(map(n, 0, MAX_STARS, 0, STAR_NOTES.length - 1)), 0, STAR_NOTES.length - 1);
  chime.freq(midiToFreq(STAR_NOTES[i]));
  chimeEnv.play(chime);
}

function keyPressed() {
  if (key === "s" || key === "S") saveCanvas("my-zodiac-circle", "png");
  if (key === "v" || key === "V") showCamera = !showCamera;
  if (key === "i" || key === "I") showInfo = !showInfo;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  magicCircle.x = width / 2;
  magicCircle.y = height / 2;
  magicCircle.R = min(width, height) * 0.32;
  initStars();
  layoutConstellations();
}

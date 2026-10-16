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

const SKY_DEEP = "#05122e";  // 深邃的星空蓝黑（参考壁纸《Starry Sky︱星空》的夜空底色）
const MAX_STARS = 300;       // 星空中星星数量的上限

let stars = [];        // 星星：{x, y, px, py, homeX, homeY, r, phase, seed, tx, ty, hasTarget}
let magicCircle;       // 法阵：{x, y, R, rot, open}
let zodiacs = [];      // 十二星座（数据来自 constellations.js，这里补上画面坐标和状态）
let current = 0;       // 现在是哪一个星座
let summoned = false;  // 星座是否被召唤（连线是否渐显）
let lastGesture = {};
let showInfo = true;

// ---------- 星空视差背景（图层全部来自壁纸《Starry Sky︱星空》，深度照搬原场景） ----------
const BG_W = 1920, BG_H = 1080; // 壁纸的设计分辨率，所有图层坐标都基于它
const bgImg = {};               // 预加载的图层图片
// 每层：图片、视差深度（远处小、近处大）、可选 blend/alpha、若干实例 [中心x, 中心y, 缩放, 设计宽, 设计高]
const BG_LAYERS = [
  { img: "sky",   depth: 0,    items: [[960, 540, 1.03, 1920, 1080]] },                       // 主背景：一整片星空
  { img: "glow2", depth: 0,    blend: "screen", alpha: 200, items: [[960, 540, 1.03, 1920, 1080]] }, // 梦幻光晕（screen 混合，黑底变透明只留光）
  { img: "lut",   depth: 0,    items: [[960, 877.52, 1.03, 1920, 626]] },                     // 地平线向上的蓝色辉光
  { img: "land",  depth: 0.07, items: [[960, 976.76, 1.03, 1920, 225]] },                     // 群山与草地剪影
  { img: "f1",    depth: 0.10, items: [[974.52, 525.48, 1.03, 687, 762]] },                   // 漂浮的大画框
  { img: "f9",    depth: 0.10, items: [[1325.08, 716.78, 1.03, 46, 52]] },
  { img: "f13",   depth: 0.10, items: [[1458.06, 322.38, 1.03, 44, 45]] },
  { img: "f7",    depth: 0.15, items: [[427.01, 736.33, 1.03, 50, 34]] },
  { img: "f10",   depth: 0.20, items: [[1421.74, 807.04, 1.03, 72, 38]] },
  // 原壁纸有十几个画框，其中几张是特殊压缩格式没解开，用已有画框补位让视差更丰富
  { img: "f7",    depth: 0.22, items: [[180, 180, 1.8, 50, 34]] },
  { img: "f10",   depth: 0.27, items: [[320, 640, 1.6, 72, 38]] },
  { img: "f9",    depth: 0.30, items: [[1620, 760, 2.2, 46, 52]] },
  { img: "leak",  depth: 0.45, blend: "screen", alpha: 150, items: [[947.63, 780.66, 1.5, 1246, 720]] }, // 近处漂浮的镜头光斑
  { img: "leak",  depth: 0.75, blend: "screen", alpha: 110, items: [[882.58, 750.76, 1.6, 1246, 720]] }, // 最贴近眼睛的光斑，挥手时动得最多
];

function preload() {
  bgImg.sky = loadImage("bg/sky.jpg");
  bgImg.glow2 = loadImage("bg/glow2.jpg");
  bgImg.lut = loadImage("bg/lut.png");
  bgImg.land = loadImage("bg/land.png");
  bgImg.f1 = loadImage("bg/f1.png");
  bgImg.f7 = loadImage("bg/f7.png");
  bgImg.f9 = loadImage("bg/f9.png");
  bgImg.f10 = loadImage("bg/f10.png");
  bgImg.f13 = loadImage("bg/f13.png");
  bgImg.leak = loadImage("bg/leak.jpg");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  magicCircle = { x: width / 2, y: height / 2, R: min(width, height) * 0.32, rot: 0, open: false };
  initStars();
  initBokehs();
  layoutConstellations();
  select("#start").mouseClicked(startExperience);
}

// 铺一片新星空：星星随机散布，各自有大小、颜色、闪烁节奏和“家”
function initStars() {
  stars = [];
  const n = min(width, height) < 600 ? 170 : 270; // 小屏少撒一点星星，手机更流畅
  for (let i = 0; i < n; i++) stars.push(newStar(random(width), random(height), random(1.5, 4.5)));
}

// 星星的颜色盘：大部分是钻石般的冷白蓝，偶尔有青碧、紫、暖白的宝石
const STAR_TINTS = [
  [210, 225, 255], [210, 225, 255], [210, 225, 255], // 冷白蓝（常见）
  [190, 215, 255], [190, 215, 255],
  [150, 215, 255], // 天青
  [140, 235, 225], // 青碧
  [180, 170, 255], // 紫
  [255, 240, 215], // 暖白（少见）
];

function newStar(x, y, r) {
  return {
    x, y, px: x, py: y, homeX: x, homeY: y,
    r, phase: random(TWO_PI), seed: random(1000),
    speed: random(0.5, 1.3),   // 每颗星星自己的闪烁快慢
    tint: random(STAR_TINTS),  // 每颗星星自己的宝石颜色
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
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.elt.setAttribute("playsinline", ""); // 手机浏览器里不跳出全屏播放器
  video.elt.setAttribute("muted", "");
  video.hide();

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

  // 2. 星空背景：蓝黑底 + 多层视差（手挥动 / 鼠标移动 / 自动漂移都会带着背景分层移动）
  background(SKY_DEEP);
  updateParallax();
  drawBackground();
  if (started && showCamera) drawCamera();

  // 3. 星星
  for (const s of stars) {
    updateStar(s);
    drawStar(s);
  }

  // 失焦光斑：几颗大大的柔光点，像镜头没对上焦的亮星
  drawBokehs();

  // 流星：偶尔从天空划过
  drawShootingStar();

  // 4. 法阵：展开后先不旋转，跟着手掌的拧动而旋转（外顺、中逆、内慢，整体放慢）
  let twist = handTwistDelta();
  if (magicCircle.open) magicCircle.rot += twist * 0.7;
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
  // 画一颗钻石般闪烁的星星：染上自己颜色的光晕 + 亮核 + 十字光芒
  // 1. pulse 在 0.4 和 1 之间来回摆动；每颗星星有自己的节奏（s.speed）和起点（s.phase）
  let pulse = 0.7 + 0.3 * sin(frameCount * 0.06 * s.speed + s.phase);
  // 2. 大小跟着呼吸一起变化
  let r = s.r * pulse;
  // 3. 光晕不需要描边
  noStroke();
  // 4. 光晕染上这颗星星自己的宝石颜色，4 层越来越大、越来越淡
  for (let i = 4; i >= 1; i--) {
    fill(s.tint[0], s.tint[1], s.tint[2], 18);
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
  // 每帧更新一颗星星的位置：平时在家附近缓缓漂移，被召唤时沿弧线飞向目标点并留下光尾
  if (s.hasTarget === false) {
    // 1. 平时：用 noise 在家 (homeX, homeY) 附近缓缓漂移
    //    （相邻帧的 noise 值很接近，所以运动丝滑不抖动）
    s.x = s.homeX + (noise(s.seed, frameCount * 0.001) - 0.5) * 40;
    s.y = s.homeY + (noise(s.seed + 100, frameCount * 0.001) - 0.5) * 40;
    // 没有移动，上一帧的位置就是现在的位置
    s.px = s.x;
    s.py = s.y;
  } else {
    // 2. 被召唤：缓动（每帧走剩下路程的 7%，开始快、靠近时慢，优雅地滑进目标点）
    //    再加一点点垂直于飞行方向的偏移 (-dy, dx)，星星就划出一道弧线，像被引力甩过去
    let dx = s.tx - s.x;
    let dy = s.ty - s.y;
    s.x += dx * 0.07 + (-dy) * 0.012;
    s.y += dy * 0.07 + dx * 0.012;
  }
  // 3. 光尾：把上一帧的位置和现在的位置连成一条淡蓝色的线，像拖着渐隐的彗尾
  //    （漂移时光尾长度为 0，所以看不见）
  stroke(170, 210, 255, 80);
  strokeWeight(1.5);
  line(s.px, s.py, s.x, s.y);
  noStroke();
  // 4. 记住现在的位置，给下一帧用
  s.px = s.x;
  s.py = s.y;
}
// ★★★★★★ 第 2 步 结束 ★★★★★★

// ★★★★★★ 第 3 步 开始：把这里的 drawMagicCircle 函数整个换成 Agent 写的版本 ★★★★★★
function drawMagicCircle(mc) {
  // 参考《法术设计·阵法》的高亮金色法阵：每条线都画好几层，外层粗而淡、内层细而亮，
  // 再用加法混合（ADD）把重叠的金光烧成白亮——这就是“高亮魔法感”的关键
  // 旋转仍由手掌拧动驱动：外环顺时针，中环同速反向，内环同向但慢一半
  // 1. 法阵没有展开时什么都不画
  if (mc.open === false) {
    mc.openT = 0;
    return;
  }
  // 2. 展开动画：每次召唤都刷新一炉光尘，法阵带一点回弹地放大浮现
  if (mc.openT === 0 || mc.openT === undefined) initMagicMotes();
  mc.openT = min(1, mc.openT + 0.045);
  const appear = mc.openT;
  const ease = 1 + 2.7 * pow(appear - 1, 3) + 1.7 * pow(appear - 1, 2); // easeOutBack 回弹
  // 3. 呼吸：半径轻轻起伏，辉光也跟着一明一暗
  const breath = 1 + 0.01 * sin(frameCount * 0.05);
  const pulse = (0.72 + 0.28 * sin(frameCount * 0.04)) * appear;
  const R = mc.R * breath * ease;
  const cx = mc.x, cy = mc.y;
  const smallScreen = min(width, height) < 600; // 小屏减量，手机更流畅

  noFill();
  blendMode(ADD); // 加法混合：金光叠金光会越来越亮，直到白热

  // 4. 底座光晕：法阵底下一团柔和的径向金光，把法阵“托”起来
  for (let k = 4; k >= 1; k--) {
    stroke(255, 196, 90, 6 * pulse);
    strokeWeight(R * 0.10 * k);
    circle(cx, cy, 2 * R);
  }

  // 5. 外环（深金，跟着手掌顺时针）：双圆环 + 符文带 + 八支光矛 + 八颗菱形宝石
  const rotO = mc.rot;
  magicRing(cx, cy, 2 * R, 255, 200, 95, 2.2, 130 * pulse);
  magicRing(cx, cy, 1.88 * R, 255, 200, 95, 1.6, 110 * pulse);
  // 符文带：两环之间一圈伪符文（短竖、小尖角、竖加点、交叉），按位置确定地变化
  const runeCount = smallScreen ? 24 : 48;
  for (let i = 0; i < runeCount; i++) {
    const a = rotO + (i * TWO_PI) / runeCount;
    const px = cx + cos(a) * R * 0.94;
    const py = cy + sin(a) * R * 0.94;
    const s = R * 0.018;
    push();
    translate(px, py);
    rotate(a + HALF_PI);
    const pat = (i * 5 + 3) % 4;
    if (pat === 0) {
      magicLine(0, -s, 0, s, 255, 205, 100, 1, 120 * pulse);
    } else if (pat === 1) {
      magicLine(-s * 0.6, s * 0.6, 0, -s, 255, 205, 100, 1, 120 * pulse);
      magicLine(s * 0.6, s * 0.6, 0, -s, 255, 205, 100, 1, 120 * pulse);
    } else if (pat === 2) {
      magicLine(0, -s, 0, s * 0.4, 255, 205, 100, 1, 120 * pulse);
      stroke(255, 220, 140, 150 * pulse);
      strokeWeight(2.5);
      point(0, s * 0.9);
    } else {
      magicLine(-s * 0.5, -s, s * 0.5, s, 255, 205, 100, 1, 120 * pulse);
      magicLine(s * 0.5, -s, -s * 0.5, s, 255, 205, 100, 1, 120 * pulse);
    }
    pop();
  }
  // 八支光矛：法阵最外圈的尖刺剪影（参考图里最醒目的轮廓）
  for (let i = 0; i < 8; i++) {
    const a = rotO + (i * TWO_PI) / 8;
    const dA = 0.022; // 矛底半宽（弧度）
    const tX = cx + cos(a) * R * 1.17, tY = cy + sin(a) * R * 1.17; // 矛尖
    magicLine(cx + cos(a - dA) * R, cy + sin(a - dA) * R, tX, tY, 255, 214, 120, 1.4, 130 * pulse);
    magicLine(cx + cos(a + dA) * R, cy + sin(a + dA) * R, tX, tY, 255, 214, 120, 1.4, 130 * pulse);
    magicLine(cx + cos(a) * R * 0.99, cy + sin(a) * R * 0.99, tX, tY, 255, 230, 160, 0.8, 110 * pulse); // 矛脊
  }
  // 八颗菱形宝石：挂在光矛之间，沿径向摆放，中心一点白亮
  for (let i = 0; i < 8; i++) {
    const a = rotO + ((i + 0.5) * TWO_PI) / 8;
    push();
    translate(cx + cos(a) * R * 1.02, cy + sin(a) * R * 1.02);
    rotate(a + HALF_PI);
    const dR = R * 0.045, dT = R * 0.026;
    magicLine(0, -dR, dT, 0, 255, 224, 150, 1.2, 140 * pulse);
    magicLine(dT, 0, 0, dR, 255, 224, 150, 1.2, 140 * pulse);
    magicLine(0, dR, -dT, 0, 255, 224, 150, 1.2, 140 * pulse);
    magicLine(-dT, 0, 0, -dR, 255, 224, 150, 1.2, 140 * pulse);
    noStroke();
    fill(255, 246, 220, 200 * pulse);
    circle(0, 0, 3.2);
    noFill();
    pop();
  }

  // 6. 中环（亮金，和外环同速、反向）：24 段虚线圆弧 + 12 颗光珠
  const rotM = mc.rot * -1;
  const R2 = R * 0.68;
  for (let i = 0; i < 24; i += 2) {
    const a = rotM + (i * TWO_PI) / 24;
    magicArc(cx, cy, R2 * 2, a, a + TWO_PI / 24, 255, 218, 130, 1.8, 120 * pulse);
  }
  for (let i = 1; i < 24; i += 2) {
    const a = rotM + (i * TWO_PI) / 24;
    const px = cx + cos(a) * R2;
    const py = cy + sin(a) * R2;
    noStroke();
    fill(255, 218, 130, 40 * pulse);
    circle(px, py, 12);
    fill(255, 246, 220, 220 * pulse);
    circle(px, py, 3.5);
    noFill();
  }

  // 7. 内环（淡金白，和外环同向、速度慢一半）：十二瓣曼陀罗 + 六角星 + 中心圆
  const rotI = mc.rot * 0.5;
  const R3 = R * 0.42;
  for (let i = 0; i < 12; i++) {
    push();
    translate(cx, cy);
    rotate(rotI + (i * TWO_PI) / 12);
    magicEllipse(R3 * 0.52, 0, R3 * 0.58, R3 * 0.24, 255, 236, 180, 1.2, 110 * pulse);
    pop();
  }
  magicRing(cx, cy, R * 0.16, 255, 236, 180, 1.4, 120 * pulse);
  // 六角星：两个三角形交错叠成
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 3; j++) {
      const a1 = rotI + k * (PI / 3) + (j * TWO_PI) / 3;
      const a2 = rotI + k * (PI / 3) + ((j + 1) * TWO_PI) / 3;
      magicLine(cx + cos(a1) * R * 0.075, cy + sin(a1) * R * 0.075,
                cx + cos(a2) * R * 0.075, cy + sin(a2) * R * 0.075,
                255, 240, 200, 1, 120 * pulse);
    }
  }
  // 中心光核：一小团白热的光
  noStroke();
  for (let k = 4; k >= 1; k--) {
    fill(255, 232, 170, 10 * pulse);
    circle(cx, cy, R * 0.06 * k);
  }
  fill(255, 250, 230, 180 * pulse);
  circle(cx, cy, R * 0.02);

  // 8. 光尘：金色光点在法阵里慢慢环绕、忽明忽暗（参考图里飞舞的光点）
  for (const m of magicMotes) {
    const a = m.a0 + frameCount * m.spd;
    const px = cx + cos(a) * R * m.rr;
    const py = cy + sin(a) * R * m.rr;
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * sin(frameCount * 0.07 + m.tw));
    fill(255, 214, 120, 36 * tw * appear);
    circle(px, py, m.sz * 3.2);
    fill(255, 246, 220, 200 * tw * appear);
    circle(px, py, m.sz);
  }

  blendMode(BLEND); // 恢复正常混合，别影响后面的星星和星座
}

// 多层发光直线：外晕 → 中晕 → 主色 → 白热芯
function magicLine(x1, y1, x2, y2, r, g, b, w, a) {
  stroke(r, g, b, a * 0.10);
  strokeWeight(w * 5);
  line(x1, y1, x2, y2);
  stroke(r, g, b, a * 0.30);
  strokeWeight(w * 2.2);
  line(x1, y1, x2, y2);
  stroke(r, g, b, a);
  strokeWeight(w);
  line(x1, y1, x2, y2);
  stroke(255, 246, 220, a * 0.85);
  strokeWeight(max(w * 0.4, 0.6));
  line(x1, y1, x2, y2);
}

// 多层发光圆环
function magicRing(x, y, d, r, g, b, w, a) {
  stroke(r, g, b, a * 0.10);
  strokeWeight(w * 5);
  circle(x, y, d);
  stroke(r, g, b, a * 0.30);
  strokeWeight(w * 2.2);
  circle(x, y, d);
  stroke(r, g, b, a);
  strokeWeight(w);
  circle(x, y, d);
  stroke(255, 246, 220, a * 0.85);
  strokeWeight(max(w * 0.4, 0.6));
  circle(x, y, d);
}

// 多层发光圆弧
function magicArc(x, y, d, a0, a1, r, g, b, w, a) {
  stroke(r, g, b, a * 0.10);
  strokeWeight(w * 5);
  arc(x, y, d, d, a0, a1);
  stroke(r, g, b, a * 0.30);
  strokeWeight(w * 2.2);
  arc(x, y, d, d, a0, a1);
  stroke(r, g, b, a);
  strokeWeight(w);
  arc(x, y, d, d, a0, a1);
  stroke(255, 246, 220, a * 0.85);
  strokeWeight(max(w * 0.4, 0.6));
  arc(x, y, d, d, a0, a1);
}

// 多层发光椭圆（曼陀罗花瓣）
function magicEllipse(x, y, w, h, r, g, b, wt, a) {
  stroke(r, g, b, a * 0.10);
  strokeWeight(wt * 5);
  ellipse(x, y, w, h);
  stroke(r, g, b, a * 0.30);
  strokeWeight(wt * 2.2);
  ellipse(x, y, w, h);
  stroke(r, g, b, a);
  strokeWeight(wt);
  ellipse(x, y, w, h);
  stroke(255, 246, 220, a * 0.8);
  strokeWeight(max(wt * 0.4, 0.6));
  ellipse(x, y, w, h);
}

// 法阵里环绕的金色光尘
let magicMotes = [];
function initMagicMotes() {
  magicMotes = [];
  const n = min(width, height) < 600 ? 12 : 26; // 小屏少一点
  for (let i = 0; i < n; i++) {
    magicMotes.push({
      rr: random(0.15, 1.08),  // 离中心的距离比例
      a0: random(TWO_PI),      // 起始角度
      spd: random(0.001, 0.004) * (random() < 0.5 ? -1 : 1), // 环绕快慢和方向
      tw: random(TWO_PI),      // 闪烁节奏
      sz: random(2, 4.5),
    });
  }
}
// ★★★★★★ 第 3 步 结束 ★★★★★★

// ★★★★★★ 第 4 步 开始：把这里的 drawConstellation 函数整个换成 Agent 写的版本 ★★★★★★
function drawConstellation(c) {
  // 画一个正在显形的星座：连线一段一段渐显，整个星座像魂魄一样轻轻地整体闪烁
  // 1. 几乎完全透明时什么都不画
  if (c.alpha <= 0.01) {
    return;
  }
  // 2. 魂魄般的闪烁：透明度乘上一个缓慢的节奏摆动
  let flicker = 0.75 + 0.25 * sin(frameCount * 0.08 + c.phase);
  // 3. 最终透明度 = 显形程度 × 闪烁
  let a = c.alpha * flicker;
  // 4. 画连线：发光的星座连线框，从 c.nodes[l[0]] 画到 c.nodes[l[1]]
  stroke(200, 225, 255, 220 * a);
  strokeWeight(1.2);
  for (const l of c.links) {
    let n1 = c.nodes[l[0]];
    let n2 = c.nodes[l[1]];
    line(n1.x, n1.y, n2.x, n2.y);
  }
  // 5. 画恒星光点：每个节点先画一层淡淡的蓝色光晕，再画一个亮星核
  noStroke();
  for (const n of c.nodes) {
    fill(190, 215, 255, 60 * a);
    circle(n.x, n.y, 14);
    fill(255, 250, 230, 255 * a);
    circle(n.x, n.y, 4);
  }
}
// ★★★★★★ 第 4 步 结束 ★★★★★★

// ★★★★★★ 第 5 步 开始：把这里的 onGesture 函数整个换成 Agent 写的版本 ★★★★★★
function onGesture(g, hand) {
  // 一个手势刚刚开始时会调用这个函数，根据手势做不同的事
  // 1. 食指指尖和手掌中心
  let tip = hand.points[8];
  let palm = hand.points[9];
  // 2. ☝️ 食指向上：在指尖点亮一颗引导星
  if (g === "Pointing_Up" && stars.length < MAX_STARS) {
    spawnGuideStar(tip.x, tip.y);
  }
  // 3. 🖐 张开手掌：召唤三层法阵，由内向外展开
  if (g === "Open_Palm" && magicCircle.open === false) {
    magicCircle.open = true;
  }
  // 4. 👍 拇指向上：漫天星星拖着光尾向星座汇聚；再比一次 👍 取消汇聚
  if (g === "Thumb_Up") {
    if (summoned) unsummonConstellation();
    else summonConstellation();
  }
  // 5. ✊ 握拳：一切向中心收拢归寂
  if (g === "Closed_Fist") {
    dismissAll();
  }
  // 6. 👎 拇指向下：星座消散，切换到下一个星座
  if (g === "Thumb_Down") {
    nextConstellation();
  }
  // 7. ✌️ 剪刀手：换一片新星空
  if (g === "Victory") {
    resetSky();
  }
}
// ★★★★★★ 第 5 步 结束 ★★★★★★

// ---------- 下面这些已经写好了，不需要改 ----------

// ☝️ 在指尖点亮一颗引导星（金色的，一眼就能认出来）
function spawnGuideStar(x, y) {
  const g = newStar(x, y, random(4, 6));
  g.tint = [255, 215, 130];
  stars.push(g);
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

// 👍 再比一次：取消汇聚，星星散开回家（法阵保持展开）
function unsummonConstellation() {
  for (const s of stars) s.hasTarget = false;
  summoned = false;
}

// ✊ 收拢归寂：星星散开回家，法阵收拢，星座消散
function dismissAll() {
  for (const s of stars) s.hasTarget = false;
  summoned = false;
  magicCircle.open = false;
}

// 👎 星座消散，切换到下一个星座
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

// ---------- 加分项：流星 ----------
let meteor = null; // 流星：{x, y, vx, vy, life, maxLife}，没有流星时是 null

// 每 300 帧随机从天空划过一次流星：一道从亮到暗的渐隐斜线，头部一个亮点
function drawShootingStar() {
  // 到了时间且上一颗已经消失，就生成一颗新流星（位置、方向、速度都随机）
  if (meteor === null && frameCount % 300 === 0) {
    let a = random(PI * 0.15, PI * 0.35); // 斜向下的角度
    let speed = random(9, 14);
    meteor = {
      x: random(width * 0.1, width * 0.9),
      y: random(height * 0.05, height * 0.3),
      vx: cos(a) * speed * (random() < 0.5 ? 1 : -1), // 一半机会向左，一半向右
      vy: sin(a) * speed,
      life: 0,
      maxLife: 45,
    };
  }
  if (meteor === null) return;

  // 流星向前飞
  meteor.x += meteor.vx;
  meteor.y += meteor.vy;
  meteor.life++;
  // 亮度：越飞越暗
  let fade = 1 - meteor.life / meteor.maxLife;

  // 尾巴：一段一段从亮到暗拼出渐隐的斜线
  let tail = 14;
  for (let i = 0; i < tail; i++) {
    let t1 = i / tail;
    let t2 = (i + 1) / tail;
    stroke(200, 220, 255, 160 * fade * (1 - t1));
    strokeWeight(2 * (1 - t1) + 0.5);
    line(meteor.x - meteor.vx * t1 * 6, meteor.y - meteor.vy * t1 * 6,
         meteor.x - meteor.vx * t2 * 6, meteor.y - meteor.vy * t2 * 6);
  }
  // 头部一个亮点，带一小圈光晕
  noStroke();
  fill(200, 225, 255, 90 * fade);
  circle(meteor.x, meteor.y, 10);
  fill(255, 250, 235, 220 * fade);
  circle(meteor.x, meteor.y, 4);

  // 飞完或飞出画面就消失
  if (meteor.life >= meteor.maxLife || meteor.x < -100 || meteor.x > width + 100 || meteor.y > height + 100) {
    meteor = null;
  }
}

// ---------- 星空视差背景：手 / 鼠标 / 自动漂移驱动，近处动得多、远处动得少 ----------
let parX = 0, parY = 0;   // 平滑后的视差量（-1 ~ 1）
let lastMouseMove = -999; // 上一次鼠标移动是哪一帧（没手的时候看鼠标，都没有就缓缓自动漂移）

function mouseMoved() {
  lastMouseMove = frameCount;
}

function updateParallax() {
  let tx, ty;
  if (started && hands.length > 0) {
    // 手：用掌心位置当“眼睛”——手往右挥，近处的图层就往左让，像真的在星空下转头
    const palm = hands[0].points[9];
    tx = (0.5 - palm.x / width) * 2;
    ty = (0.5 - palm.y / height) * 2;
  } else if (frameCount - lastMouseMove < 180) {
    // 鼠标：最近 3 秒内动过鼠标就跟着鼠标
    tx = (0.5 - mouseX / width) * 2;
    ty = (0.5 - mouseY / height) * 2;
  } else {
    // 什么都没有：轻轻自动漂移，画面始终是活的
    tx = sin(frameCount * 0.003) * 0.35;
    ty = cos(frameCount * 0.0023) * 0.25;
  }
  parX = lerp(parX, tx, 0.06);
  parY = lerp(parY, ty, 0.06);
}

function drawBackground() {
  const s = max(width / BG_W, height / BG_H); // cover：等比放大到铺满窗口（手机竖屏也不留空）
  const str = min(width, height) * 0.16;      // 视差强度：屏幕越大动得越明显
  push();
  imageMode(CENTER);
  for (const L of BG_LAYERS) {
    const img = bgImg[L.img];
    if (!img) continue;
    const ox = parX * L.depth * str;
    const oy = parY * L.depth * str * 0.7;
    const bleed = 1.06 + L.depth * 0.15; // 每层多画一圈，移动时不会露出边缘
    if (L.blend === "screen") blendMode(SCREEN); // 光晕层：screen 混合，黑底变透明只留光
    if (L.tint) tint(L.tint[0], L.tint[1], L.tint[2], L.alpha === undefined ? 255 : L.alpha);
    else if (L.alpha !== undefined) tint(255, L.alpha);
    else noTint();
    for (const it of L.items) {
      const x = (it[0] - BG_W / 2) * s + width / 2 + ox;
      const y = (it[1] - BG_H / 2) * s + height / 2 + oy;
      image(img, x, y, it[3] * it[2] * s * bleed, it[4] * it[2] * s * bleed);
    }
    if (L.blend === "screen") blendMode(BLEND); // 画完光晕层恢复正常混合
  }
  pop();
}

// ---------- 失焦光斑（参考壁纸里那些大颗的柔光点） ----------
let bokehs = [];

function initBokehs() {
  bokehs = [];
  const tints = [[120, 170, 255], [90, 220, 220], [160, 150, 255], [200, 225, 255]];
  const m = min(width, height) < 600 ? 6 : 9; // 小屏少几个光斑
  for (let i = 0; i < m; i++) {
    bokehs.push({
      x: random(width), y: random(height * 0.9),
      r: random(10, 26),
      phase: random(TWO_PI), seed: random(1000),
      tint: random(tints),
    });
  }
}

function drawBokehs() {
  noStroke();
  for (const b of bokehs) {
    // 几不可察地漂移 + 轻轻地一明一暗
    b.x += (noise(b.seed, frameCount * 0.0006) - 0.5) * 1.2;
    b.y += (noise(b.seed + 50, frameCount * 0.0006) - 0.5) * 1.2;
    let glow = 0.55 + 0.45 * sin(frameCount * 0.02 + b.phase);
    fill(b.tint[0], b.tint[1], b.tint[2], 14 * glow);
    circle(b.x, b.y, b.r * 2.6);
    fill(b.tint[0], b.tint[1], b.tint[2], 30 * glow);
    circle(b.x, b.y, b.r * 1.5);
    fill(255, 255, 255, 60 * glow);
    circle(b.x, b.y, b.r * 0.55);
  }
}

// ---------- 手掌拧动驱动法阵 ----------
let prevHandAngle = null; // 上一帧手掌的朝向角度

// 这一帧手掌拧动了多少角度（没有手、手刚出现、还没开始时都是 0）
function handTwistDelta() {
  if (!started || hands.length === 0) {
    prevHandAngle = null;
    return 0;
  }
  // 用手腕 (0) 指向手掌中心 (9) 的方向表示手掌的朝向
  const p0 = hands[0].points[0];
  const p9 = hands[0].points[9];
  const angle = atan2(p9.y - p0.y, p9.x - p0.x);
  if (prevHandAngle === null) {
    prevHandAngle = angle;
    return 0;
  }
  // 最短角度差（处理角度从 PI 跳到 -PI 的情况）
  let delta = angle - prevHandAngle;
  delta = atan2(sin(delta), cos(delta));
  prevHandAngle = angle;
  // 限制每帧最大拧动，防止识别抖动带着法阵猛转
  return constrain(delta, -0.18, 0.18);
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
  initBokehs();
  layoutConstellations();
}

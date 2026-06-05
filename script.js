/**
 * Minecraft style Educational Game - Client Side Static Script (script.js)
 * Interacts with Google Apps Script Web App API using Fetch CORS calls.
 * Implements highly animated clicker mining mechanics, particles, and pickaxe shop.
 */

// Global Game State
const state = {
  user: null,
  xp: 0,
  level: 1,
  gold: 100,
  posts: [],
  bonusOres: [],
  badges: [],
  quests: [],
  recommendedPost: null,
  recommendedShown: false,
  postHp: {}, // postId -> { hp, maxHp }
  bonusOresHp: {}, // oreId -> { hp, maxHp }
  tempBonusGold: {} // blockId -> accumulated hit bonus gold
};

// Canvas Engine Configuration
let canvas, ctx;
const TILE_SIZE = 48; // Increased scale for voxel tiles
const MAP_SIZE = 60; // 60x60 grid tiles
const WORLD_WIDTH = MAP_SIZE * TILE_SIZE; // 2880 pixels
const WORLD_HEIGHT = MAP_SIZE * TILE_SIZE; // 2880 pixels
let GROUND_Y = 0; // Calculated on canvas resize for legacy fallback

// 2D Map Grid Setup (0: walkable floor, 1: solid stone wall)
const mapGrid = [];
function initMapGrid() {
  for (let r = 0; r < MAP_SIZE; r++) {
    mapGrid[r] = [];
    for (let c = 0; c < MAP_SIZE; c++) {
      // Outer border walls
      if (r === 0 || r === MAP_SIZE - 1 || c === 0 || c === MAP_SIZE - 1) {
        mapGrid[r][c] = 1;
      }
      // Vertical divider wall (Great Mine vs Socially Vulnerable Mine)
      else if (c === 30 && (r < 20 || r > 40)) {
        mapGrid[r][c] = 1;
      }
      // Natural scattered pillars
      else if ((r % 12 === 0 && c % 12 === 0) || (r === 15 && c === 15) || (r === 45 && c === 45)) {
        mapGrid[r][c] = 1;
      }
      else {
        mapGrid[r][c] = 0;
      }
    }
  }
}
initMapGrid();

// Seed-based stable coordinate mapper to distribute database items into 2D Grid
function getEntityWorldCoords(item, type) {
  if (item._worldX !== undefined && item._worldY !== undefined) {
    return { x: item._worldX, y: item._worldY };
  }
  
  let seed = 0;
  if (type === 'post') {
    const id = item.postId || "";
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
  } else if (type === 'bonus_ore') {
    const id = item.oreId || "";
    for (let i = 0; i < id.length; i++) seed += id.charCodeAt(i);
  }
  
  function pseudoRandom() {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }
  
  let tileX, tileY;
  const isLeftZone = (type === 'post') 
    ? (["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor", "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(item.category) !== -1)
    : (item.x < 500); // legacy coordinate check
  
  let attempts = 0;
  while (attempts < 100) {
    if (isLeftZone) {
      // Great Mine area: col 2 ~ 28, row 2 ~ 57
      tileX = 2 + Math.floor(pseudoRandom() * 26);
      tileY = 2 + Math.floor(pseudoRandom() * 55);
    } else {
      // Socially Vulnerable Mine area: col 32 ~ 57, row 2 ~ 57
      tileX = 32 + Math.floor(pseudoRandom() * 25);
      tileY = 2 + Math.floor(pseudoRandom() * 55);
    }
    
    if (mapGrid[tileY] && mapGrid[tileY][tileX] === 0) {
      break;
    }
    attempts++;
  }
  
  item._worldX = tileX * TILE_SIZE;
  item._worldY = tileY * TILE_SIZE;
  return { x: item._worldX, y: item._worldY };
}

// Bounding box tile collision check
function checkWallCollision(x, y) {
  const paddingX = 4;
  const paddingY = 16;
  const box = {
    left: x + paddingX,
    right: x + player.width - paddingX,
    top: y + player.height - paddingY,
    bottom: y + player.height
  };
  
  const startCol = Math.floor(box.left / TILE_SIZE);
  const endCol = Math.floor(box.right / TILE_SIZE);
  const startRow = Math.floor(box.top / TILE_SIZE);
  const endRow = Math.floor(box.bottom / TILE_SIZE);
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r < 0 || r >= MAP_SIZE || c < 0 || c >= MAP_SIZE) {
        return true;
      }
      if (mapGrid[r][c] === 1) {
        return true;
      }
    }
  }
  return false;
}

// Pickaxe upgrade configurations
const pickaxes = {
  wood: { tier: 'wood', name: '나무 곡괭이', emoji: '🪵', power: 1, cost: 0, color: '#ab7f56' },
  stone: { tier: 'stone', name: '돌 곡괭이', emoji: '🪨', power: 2, cost: 100, color: '#7a7a7a', badge: 'pickaxe_stone' },
  iron: { tier: 'iron', name: '철 곡괭이', emoji: '⛏️', power: 3, cost: 300, color: '#d1d5db', badge: 'pickaxe_iron' },
  gold: { tier: 'gold', name: '금 곡괭이', emoji: '🪙', power: 4, cost: 600, color: '#fbbf24', badge: 'pickaxe_gold' },
  diamond: { tier: 'diamond', name: '다이아몬드 곡괭이', emoji: '💎', power: 5, cost: 1000, color: '#22d3ee', badge: 'pickaxe_diamond' }
};

// Player Object
const player = {
  x: 15 * TILE_SIZE, // Start in Great Mine
  y: 30 * TILE_SIZE,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  width: 24,
  height: 44,
  speed: 6.5,
  jumpForce: -9,
  gravity: 0.5,
  grounded: true,
  direction: 1, // 1 = right, -1 = left
  animFrame: 0,
  animTimer: 0,
  isMoving: false,
  isSwinging: false,
  swingAngle: 0,
  swingTimer: 0
};

// Camera Object with screen shake
const camera = {
  x: 0,
  y: 0,
  lerpSpeed: 0.1,
  shakeTimer: 0,
  shakeIntensity: 0,
  shakeX: 0,
  shakeY: 0
};

// Visual Juice Particles and Floating text
const juice = {
  particles: [],
  floatingTexts: []
};

// Static NPCs list with Grid coordinates
const npcs = [
  { id: "READ_3", name: "기록가 할아버지", tileX: 5, tileY: 5, emoji: "👴", questTitle: "독서 입문자", questDesc: "친구들의 인물 블록 3개를 찾아서 읽어보세요.", rewardXp: 50, rewardBadge: "독서 입문자" },
  { id: "LIKE_5", name: "마을 선생님", tileX: 15, tileY: 20, emoji: "👩‍🏫", questTitle: "공감의 요정", questDesc: "친구들의 인물 블록에 좋아요를 5회 눌러주세요.", rewardXp: 30, rewardBadge: "공감의 요정" },
  { id: "COMMENT_2", name: "도서관 사서", tileX: 8, tileY: 45, emoji: "🧙‍♂️", questTitle: "친절한 이웃", questDesc: "친구들의 인물 블록에 친절한 댓글을 2개 남겨보세요.", rewardXp: 40, rewardBadge: "친절한 이웃" },
  { id: "FIND_GREAT", name: "환경 지킴이", tileX: 35, tileY: 10, emoji: "👨‍🌾", questTitle: "역사 탐험가", questDesc: "위대한 인물 마을(x: 0~500)의 인물 블록을 1개 찾아 읽으세요.", rewardXp: 50, rewardBadge: "역사 탐험가" },
  { id: "FIND_POOR", name: "복지 활동가", tileX: 50, tileY: 40, emoji: "👩‍⚕️", questTitle: "따뜻한 시선", questDesc: "소외된 인물 마을(x: 501~1000)의 인물 블록을 1개 찾아 읽으세요.", rewardXp: 50, rewardBadge: "따뜻한 시선" }
];

// Achievements Badge Metadata
const badgeMetadata = {
  "독서 입문자": { icon: "🏆", desc: "기록가 할아버지 퀘스트 완료" },
  "공감의 요정": { icon: "🧚", desc: "마을 선생님 퀘스트 완료" },
  "친절한 이웃": { icon: "💬", desc: "도서관 사서 퀘스트 완료" },
  "역사 탐험가": { icon: "🧭", desc: "환경 지킴이 퀘스트 완료" },
  "따뜻한 시선": { icon: "❤️", desc: "복지 활동가 퀘스트 완료" },
  "독서가": { icon: "📚", desc: "인물 블록 10개 이상 정독" },
  "탐험가": { icon: "🗺️", desc: "인물 블록 30개 이상 정독" },
  "마을 연구자": { icon: "🔬", desc: "인물 블록 50개 이상 정독" },
  "소통왕": { icon: "📣", desc: "댓글 20개 이상 작성" },
  "인기 작가": { icon: "👑", desc: "작성한 인물 블록에 좋아요 30개 달성" }
};

// Input State
const keys = {};

// Helper: Make Fetch API request using GET
function callApi(action, params = {}) {
  const apiUrl = localStorage.getItem('mc_api_url');
  if (!apiUrl) {
    openModal('modal-api-settings');
    return Promise.reject(new Error("API URL not configured"));
  }

  const url = new URL(apiUrl);
  url.searchParams.set('action', action);
  for (const k in params) {
    url.searchParams.set(k, params[k]);
  }

  return fetch(url.toString(), {
    method: 'GET',
    mode: 'cors'
  })
  .then(res => {
    if (!res.ok) throw new Error("HTTP error: " + res.status);
    return res.json();
  })
  .then(data => {
    if (data.error) throw new Error(data.error);
    return data;
  })
  .catch(err => {
    console.error("API Call error (" + action + "):", err);
    alert("서버 연결 실패! API 설정 주소를 확인해 주세요.\n(" + err.message + ")");
    openModal('modal-api-settings');
    throw err;
  });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initUI();
  checkApiAndSession();
});

// Setup DOM Event Listeners
function initUI() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Login Form
  document.getElementById('login-submit-btn').addEventListener('click', handleLogin);
  document.getElementById('username-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // HUD Buttons
  document.getElementById('hud-profile-btn').addEventListener('click', openProfileModal);
  document.getElementById('add-block-trigger-btn').addEventListener('click', () => openModal('modal-add-post'));
  document.getElementById('recom-banner-trigger').addEventListener('click', showRecommendationCard);

  // API Config Controls
  document.getElementById('settings-trigger-btn').addEventListener('click', () => {
    const cachedUrl = localStorage.getItem('mc_api_url') || '';
    document.getElementById('api-url-input').value = cachedUrl;
    openModal('modal-api-settings');
  });
  document.getElementById('setup-api-link').addEventListener('click', (e) => {
    e.preventDefault();
    const cachedUrl = localStorage.getItem('mc_api_url') || '';
    document.getElementById('api-url-input').value = cachedUrl;
    openModal('modal-api-settings');
  });
  document.getElementById('api-url-save-btn').addEventListener('click', saveApiUrlSettings);

  // Shop trigger
  document.getElementById('shop-trigger-btn').addEventListener('click', openShopModal);

  // Teleports
  document.getElementById('tp-great-btn').addEventListener('click', () => teleportPlayer(100));
  document.getElementById('tp-poor-btn').addEventListener('click', () => teleportPlayer(600));

  // Block Submission Form
  document.getElementById('form-submit-btn').addEventListener('click', submitPost);

  // Detail Modal Controls
  document.getElementById('detail-like-btn').addEventListener('click', handleLikeToggle);
  document.getElementById('detail-comment-submit-btn').addEventListener('click', submitComment);
  document.getElementById('detail-comment-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitComment();
  });

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyF') {
      checkInteraction();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Mobile Controller Actions
  const btnUp = document.getElementById('btn-up');
  const btnDown = document.getElementById('btn-down');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnAction = document.getElementById('btn-action');
  const btnJump = document.getElementById('btn-jump');

  if (btnUp) {
    btnUp.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowUp'] = true; });
    btnUp.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowUp'] = false; });
  }
  if (btnDown) {
    btnDown.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowDown'] = true; });
    btnDown.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowDown'] = false; });
  }
  btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowLeft'] = true; });
  btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowLeft'] = false; });
  btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowRight'] = true; });
  btnRight.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowRight'] = false; });
  
  btnAction.addEventListener('touchstart', (e) => { e.preventDefault(); checkInteraction(); });
  if (btnJump) {
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); keys['Space'] = true; });
    btnJump.addEventListener('touchend', (e) => { e.preventDefault(); keys['Space'] = false; });
  }

  if (!('ontouchstart' in window)) {
    document.getElementById('mobile-controller').classList.add('hidden');
  }

  canvas.addEventListener('mousedown', handleCanvasClick);
}

// Check if API URL is set and verify local session
function checkApiAndSession() {
  const apiUrl = localStorage.getItem('mc_api_url');
  if (!apiUrl) {
    showScreen('screen-login');
    openModal('modal-api-settings');
  } else {
    checkSession();
  }
}

// Save API URL configuration
function saveApiUrlSettings() {
  let urlVal = document.getElementById('api-url-input').value.trim();
  if (!urlVal) {
    alert("구글 앱스 스크립트 웹앱 주소를 입력하세요.");
    return;
  }

  localStorage.setItem('mc_api_url', urlVal);
  closeModal('modal-api-settings');
  
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = "API 서버에 접속 중입니다...";
  
  callApi('initDatabase')
    .then((res) => {
      alert("API 서버 연동 성공!");
      checkSession();
    })
    .catch((err) => {
      showScreen('screen-login');
      openModal('modal-api-settings');
    });
}

// Centralized State Updater
function updateGameState(gameData) {
  state.xp = gameData.xp;
  state.level = gameData.level;
  state.gold = gameData.gold || 0;
  state.posts = gameData.posts || [];
  state.bonusOres = gameData.bonusOres || [];
  state.badges = gameData.badges || [];
  state.quests = gameData.quests || [];
  if (gameData.recommendedPost) {
    state.recommendedPost = gameData.recommendedPost;
  }
  
  // Sync HP for posts
  (state.posts || []).forEach(p => {
    if (!state.postHp[p.postId]) {
      const isRare = ["Hero", "Migrant worker", "영웅", "이주노동자"].indexOf(p.category) !== -1;
      const max = isRare ? 8 : 5;
      state.postHp[p.postId] = { hp: max, maxHp: max };
    }
  });

  // Sync HP for bonus ores
  (state.bonusOres || []).forEach(ore => {
    if (!state.bonusOresHp[ore.oreId]) {
      state.bonusOresHp[ore.oreId] = { hp: ore.hp, maxHp: ore.hp };
    }
  });

  updateHUD();
}

// Load spreadsheet database items
function loadGameData() {
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = "마을 환경과 블록들을 로드하고 있습니다...";
  
  callApi('getGameData', { userId: state.user.userId })
    .then((gameData) => {
      updateGameState(gameData);
      
      // Trigger canvas resizing once game-screen becomes visible
      showScreen('screen-game');
      
      // Center camera on player
      resizeCanvas();
      player.x = 15 * TILE_SIZE;
      player.y = 30 * TILE_SIZE;
      
      camera.x = player.x - canvas.width / 2;
      camera.y = player.y - canvas.height / 2;
      camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - canvas.width));
      camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT - canvas.height));
      
      if (!gameLoopId) {
        gameLoopId = requestAnimationFrame(gameLoop);
      }
    })
    .catch((err) => {
      console.error("Game data load failed:", err);
      showScreen('screen-login');
      openModal('modal-api-settings');
    });
}

function checkSession() {
  const storedUser = localStorage.getItem('mc_edu_user');
  if (storedUser) {
    state.user = JSON.parse(storedUser);
    loadGameData();
  } else {
    showScreen('screen-login');
  }
}

// Handle Login Form
function handleLogin() {
  const nicknameInput = document.getElementById('username-input').value.trim();
  if (!nicknameInput) {
    alert("학생 닉네임을 입력해 주세요.");
    return;
  }
  
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = "학생 정보를 생성/확인 중입니다...";
  
  callApi('registerOrLoginUser', { nickname: nicknameInput })
    .then((user) => {
      state.user = user;
      localStorage.setItem('mc_edu_user', JSON.stringify(user));
      loadGameData();
    })
    .catch((err) => {
      showScreen('screen-login');
    });
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(scr => scr.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  GROUND_Y = canvas.height - 96;
}

function updateHUD() {
  document.getElementById('hud-nickname').innerText = state.user.nickname;
  document.getElementById('hud-avatar').innerText = state.user.nickname.charAt(0).toUpperCase();
  document.getElementById('hud-level').innerText = "Lv. " + state.level;
  document.getElementById('hud-gold-text').innerText = state.gold + " G";
  
  const currentLvlMin = Math.pow(state.level - 1, 2) * 100;
  const nextLvlMin = Math.pow(state.level, 2) * 100;
  const levelXpGained = state.xp - currentLvlMin;
  const levelXpRequired = nextLvlMin - currentLvlMin;
  
  const xpPercent = Math.min(100, Math.max(0, (levelXpGained / levelXpRequired) * 100));
  document.getElementById('hud-xp-fill').style.width = xpPercent + '%';
  document.getElementById('hud-xp-text').innerText = `${state.xp} / ${nextLvlMin} XP`;

  // Calculate and update Mine Knights style remaining ores
  const activePosts = (state.posts || []).filter(p => !state.postHp[p.postId] || state.postHp[p.postId].hp > 0).length;
  const activeBonus = (state.bonusOres || []).filter(ore => !ore.hasMined).length;
  const totalPosts = (state.posts || []).length;
  const totalBonus = (state.bonusOres || []).length;

  const remainingOresEl = document.getElementById('hud-remaining-ores');
  const totalOresEl = document.getElementById('hud-total-ores');
  if (remainingOresEl && totalOresEl) {
    remainingOresEl.innerText = activePosts + activeBonus;
    totalOresEl.innerText = totalPosts + totalBonus;
  }
}

function teleportPlayer(unitX) {
  if (unitX < 500) {
    player.x = 15 * TILE_SIZE;
    player.y = 15 * TILE_SIZE;
  } else {
    player.x = 45 * TILE_SIZE;
    player.y = 15 * TILE_SIZE;
  }
  player.vx = 0;
  player.vy = 0;
  camera.x = player.x - canvas.width / 2;
  camera.y = player.y - canvas.height / 2;
}

// Get equipped pickaxe config (highest owned tier)
function getEquippedPickaxe() {
  const badges = state.badges || [];
  if (badges.includes('pickaxe_diamond')) return pickaxes.diamond;
  if (badges.includes('pickaxe_gold')) return pickaxes.gold;
  if (badges.includes('pickaxe_iron')) return pickaxes.iron;
  if (badges.includes('pickaxe_stone')) return pickaxes.stone;
  return pickaxes.wood; // Default
}

// Open pickaxe shop modal
function openShopModal() {
  document.getElementById('shop-gold-balance').innerText = state.gold;
  const container = document.getElementById('shop-items-container');
  container.innerHTML = '';
  
  const equipped = getEquippedPickaxe();
  
  for (const tier in pickaxes) {
    const pick = pickaxes[tier];
    if (tier === 'wood') continue; // Wood is not buyable
    
    const isOwned = (state.badges || []).includes(pick.badge);
    const isEquipped = (equipped.tier === tier);
    
    let btnHtml = '';
    if (isEquipped) {
      btnHtml = `<button class="pixel-btn btn-disabled" style="width:100%;">장착됨</button>`;
    } else if (isOwned) {
      btnHtml = `<button class="pixel-btn pixel-btn-primary" style="width:100%; font-size:9px;" onclick="equipPickaxe('${tier}')">장착하기</button>`;
    } else {
      const canBuy = state.gold >= pick.cost;
      btnHtml = `<button class="pixel-btn ${canBuy ? 'pixel-btn-primary' : 'btn-disabled'}" style="width:100%; font-size:9px;" onclick="buyPickaxe('${tier}', ${pick.cost})">구매하기</button>`;
    }
    
    const itemCard = document.createElement('div');
    itemCard.className = 'shop-item';
    itemCard.innerHTML = `
      <div class="shop-pick-title">${pick.name}</div>
      <div class="shop-pick-preview">${pick.emoji}</div>
      <div class="shop-pick-stats">파괴력: +${pick.power}</div>
      <div class="shop-pick-price">🪙 ${pick.cost} G</div>
      ${btnHtml}
    `;
    container.appendChild(itemCard);
  }
  
  openModal('modal-shop');
}

// Purchase Pickaxe
function buyPickaxe(tier, cost) {
  if (state.gold < cost) {
    alert("골드가 부족합니다! 인물을 탐색하고 댓글을 달아 골드를 획득해 보세요.");
    return;
  }
  
  closeModal('modal-shop');
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = `${pickaxes[tier].name} 구매 및 제작 중...`;
  
  callApi('buyPickaxe', { userId: state.user.userId, pickaxeTier: tier, cost: cost })
    .then((gameData) => {
      updateGameState(gameData);
      showScreen('screen-game');
      alert(`${pickaxes[tier].name} 구매 완료! 장착되었습니다.`);
    })
    .catch((err) => {
      showScreen('screen-game');
    });
}

// Simple local equip trigger
function equipPickaxe(tier) {
  // Equipped pickaxe is automatically the highest tier owned in this setup.
  // Showing alert to keep it clear.
  alert(`${pickaxes[tier].name}을 장착했습니다.`);
  openShopModal();
}

// Submit a new block post
function submitPost() {
  const category = document.getElementById('form-category').value;
  const name = document.getElementById('form-name').value.trim();
  const title = document.getElementById('form-title').value.trim();
  const image = document.getElementById('form-image').value.trim();
  const summary = document.getElementById('form-summary').value.trim();
  const paragraph = document.getElementById('form-paragraph').value.trim();
  
  if (!name || !title || !summary || !paragraph) {
    alert("모든 필수 입력 항목(이름, 제목, 요약, 소개글)을 채워주세요!");
    return;
  }
  
  closeModal('modal-add-post');
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = "인물 블록을 설치하는 중...";
  
  callApi('addPost', {
    userId: state.user.userId,
    category: category,
    author: state.user.nickname,
    title: `${name} - ${title}`,
    summary: summary,
    paragraph: paragraph,
    imageUrl: image
  })
  .then((gameData) => {
    document.getElementById('form-name').value = '';
    document.getElementById('form-title').value = '';
    document.getElementById('form-image').value = '';
    document.getElementById('form-summary').value = '';
    document.getElementById('form-paragraph').value = '';
    
    updateGameState(gameData);
    
    // Spawn floating text for Gold
    spawnFloatingText(player.x, player.y - 40, "+50 Gold", "#ffd700");
    spawnFloatingText(player.x, player.y - 20, "+5 XP", "#55ff55");
    
    showScreen('screen-game');
  })
  .catch((err) => {
    showScreen('screen-game');
  });
}

// Profile Modal builder
function openProfileModal() {
  document.getElementById('profile-level').innerText = "Lv. " + state.level;
  document.getElementById('profile-xp').innerText = state.xp + " XP";
  
  const container = document.getElementById('profile-badges-container');
  container.innerHTML = '';
  
  for (const bName in badgeMetadata) {
    const unlocked = (state.badges || []).includes(bName);
    const meta = badgeMetadata[bName];
    
    const badgeDiv = document.createElement('div');
    badgeDiv.className = `badge-item ${unlocked ? '' : 'locked'}`;
    badgeDiv.title = meta.desc;
    badgeDiv.innerHTML = `
      <div class="badge-icon">${unlocked ? meta.icon : '🔒'}</div>
      <div class="badge-name">${bName}</div>
    `;
    container.appendChild(badgeDiv);
  }
  
  openModal('modal-profile');
}

function showRecommendationCard() {
  if (!state.recommendedPost) {
    alert("아직 등록된 오늘의 추천 인물이 없습니다. 첫 번째 블록을 만들어 보세요!");
    return;
  }
  
  const p = state.recommendedPost;
  const title = p.title || "무명 - 인물 카드";
  document.getElementById('recom-title').innerText = title;
  document.getElementById('recom-name').innerText = title.includes('-') ? title.split('-')[0].trim() : title.trim();
  document.getElementById('recom-author').innerText = p.author || "알 수 없음";
  document.getElementById('recom-image').src = p.imageUrl || "";
  document.getElementById('recom-summary').innerText = p.summary || "";
  
  openModal('modal-recommendation');
}

// Open block details modal
let selectedPostId = null;
function openBlockDetail(postId) {
  const p = (state.posts || []).find(item => item.postId === postId);
  if (!p) return;
  
  selectedPostId = postId;
  
  const title = p.title || "무명 - 인물 카드";
  document.getElementById('detail-title').innerText = title;
  document.getElementById('detail-name').innerText = title.includes('-') ? title.split('-')[0].trim() : title.trim();
  document.getElementById('detail-category').innerText = p.category || "일반";
  document.getElementById('detail-author').innerText = p.author || "알 수 없음";
  document.getElementById('detail-image').src = p.imageUrl || "";
  document.getElementById('detail-summary').innerText = p.summary || "";
  document.getElementById('detail-paragraph').innerText = p.paragraph || "";
  document.getElementById('detail-view-count').innerText = p.viewsCount || 0;
  document.getElementById('detail-like-count').innerText = p.likesCount || 0;
  
  const likeBtn = document.getElementById('detail-like-btn');
  if (p.hasLiked) {
    likeBtn.className = "pixel-btn btn-disabled";
    likeBtn.disabled = true;
  } else {
    likeBtn.className = "pixel-btn pixel-btn-primary";
    likeBtn.disabled = false;
  }
  
  renderCommentsList(postId);
  openModal('modal-block-detail');
  
  const bonusToSend = state.tempBonusGold[postId] || 0;
  delete state.tempBonusGold[postId];

  // Record view logic
  callApi('readBlock', { userId: state.user.userId, postId: postId, bonusGold: bonusToSend })
    .then((gameData) => {
      // Awarded Gold! Bouncing text
      const prevGold = state.gold;
      const goldDiff = gameData.gold - prevGold;
      if (goldDiff > 0) {
        spawnFloatingText(player.x, player.y - 40, `+${goldDiff} Gold`, "#ffd700");
        spawnFloatingText(player.x, player.y - 20, "+10 XP", "#55ff55");
      }
      
      updateGameState(gameData);
      
      if (selectedPostId === postId) {
        const updatedPost = gameData.posts.find(item => item.postId === postId);
        if (updatedPost) {
          document.getElementById('detail-view-count').innerText = updatedPost.viewsCount;
        }
      }
    });
}

// Render comments inside detail popup
function renderCommentsList(postId) {
  const commentsList = document.getElementById('detail-comments-list');
  commentsList.innerHTML = '';
  
  callApi('getSheetData', { sheetName: 'Comments' })
    .then((commentsData) => {
      const filtered = commentsData.filter(c => c.postId === postId);
      document.getElementById('detail-comment-count').innerText = filtered.length;
      
      if (filtered.length === 0) {
        commentsList.innerHTML = '<p style="font-size:12px; color:#777; text-align:center; padding:10px 0;">작성된 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>';
        return;
      }
      
      filtered.forEach(c => {
        const dateStr = new Date(c.date).toLocaleString('ko-KR', { hour12: false });
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-card';
        commentDiv.innerHTML = `
          <div class="comment-meta">
            <span>👤 ${c.user}</span>
            <span class="comment-date">${dateStr}</span>
          </div>
          <div class="comment-content">${escapeHtml(c.comment)}</div>
        `;
        commentsList.appendChild(commentDiv);
      });
      commentsList.scrollTop = commentsList.scrollHeight;
    });
}

function submitComment() {
  const commentText = document.getElementById('detail-comment-input').value.trim();
  if (!commentText || !selectedPostId) return;
  
  document.getElementById('detail-comment-input').value = '';
  
  callApi('addComment', {
    userId: state.user.userId,
    postId: selectedPostId,
    authorNickname: state.user.nickname,
    commentText: commentText
  })
  .then((gameData) => {
    // Reward Gold!
    const prevGold = state.gold;
    const goldDiff = gameData.gold - prevGold;
    if (goldDiff > 0) {
      spawnFloatingText(player.x, player.y - 40, `+${goldDiff} Gold`, "#ffd700");
      spawnFloatingText(player.x, player.y - 20, `+5 XP`, "#55ff55");
    }
    
    updateGameState(gameData);
    renderCommentsList(selectedPostId);
  });
}

function handleLikeToggle() {
  if (!selectedPostId) return;
  
  callApi('toggleLike', { userId: state.user.userId, postId: selectedPostId })
    .then((gameData) => {
      const prevGold = state.gold;
      const goldDiff = gameData.gold - prevGold;
      if (goldDiff > 0) {
        spawnFloatingText(player.x, player.y - 40, `+${goldDiff} Gold`, "#ffd700");
        spawnFloatingText(player.x, player.y - 20, `+2 XP`, "#55ff55");
      }
      
      updateGameState(gameData);
      
      const updatedPost = gameData.posts.find(item => item.postId === selectedPostId);
      if (updatedPost) {
        document.getElementById('detail-like-count').innerText = updatedPost.likesCount;
        const likeBtn = document.getElementById('detail-like-btn');
        likeBtn.className = "pixel-btn btn-disabled";
        likeBtn.disabled = true;
      }
    });
}

// Open NPC Dialog box
function openNpcDialogue(npc) {
  document.getElementById('npc-name').innerText = npc.name;
  document.getElementById('npc-avatar').innerText = npc.emoji;
  
  const quest = (state.quests || []).find(q => q.questType === npc.id);
  const progress = quest ? Number(quest.progress) : 0;
  const status = quest ? quest.status : "IN_PROGRESS";
  
  let target = 1;
  if (npc.id === "READ_3") target = 3;
  else if (npc.id === "LIKE_5") target = 5;
  else if (npc.id === "COMMENT_2") target = 2;
  
  const percent = Math.min(100, Math.max(0, (progress / target) * 100));
  document.getElementById('npc-quest-progress-bar').style.width = percent + '%';
  document.getElementById('npc-quest-progress-text').innerText = `${progress} / ${target}`;
  document.getElementById('npc-quest-title').innerText = "퀘스트: " + npc.questTitle;
  document.getElementById('npc-quest-desc').innerText = npc.questDesc;
  document.getElementById('npc-quest-reward-xp').innerText = `+${npc.rewardXp} XP`;
  document.getElementById('npc-quest-reward-badge').innerText = `🏆 ${npc.rewardBadge} 배지`;
  
  const statusTag = document.getElementById('npc-quest-status-tag');
  
  if (status === "COMPLETED") {
    document.getElementById('npc-dialogue').innerText = `"자네가 훌륭하게 과업을 마쳤네! 보상은 이미 전달되었네. 앞으로도 우리 마을의 인물들을 널리 알려주게!"`;
    statusTag.innerText = "완료됨";
    statusTag.style.backgroundColor = "var(--mc-green)";
  } else {
    if (progress >= target) {
      document.getElementById('npc-dialogue').innerText = `"오! 퀘스트 조건을 모두 만족했구만. 정말 훌륭해! 보상을 지급하겠네."`;
      statusTag.innerText = "완료 가능";
      statusTag.style.backgroundColor = "var(--mc-gold)";
      
      callApi('readBlock', { userId: state.user.userId, postId: "post_dummy_quest_trigger" })
        .then((gameData) => {
          const prevGold = state.gold;
          const goldDiff = gameData.gold - prevGold;
          if (goldDiff > 0) {
            spawnFloatingText(player.x, player.y - 40, `+${goldDiff} Gold`, "#ffd700");
          }
          updateGameState(gameData);
          setTimeout(() => openNpcDialogue(npc), 300);
        });
    } else {
      document.getElementById('npc-dialogue').innerText = `"안녕하신가! 이 마을에 온 것을 환영하네. 혹은 내가 내는 임무를 수행해 보겠나?"`;
      statusTag.innerText = "진행중";
      statusTag.style.backgroundColor = "#444";
    }
  }
  
  openModal('modal-npc');
}

// Mine Ores (hit logic)
function mineOreBlock(blockId, isBonus = false) {
  const equipped = getEquippedPickaxe();
  
  // Set swing animation state
  player.isSwinging = true;
  player.swingAngle = -Math.PI / 4;
  player.swingTimer = 8; // duration of animation

  // Random hit gold bonus (30% chance to earn 1~3 gold on each hit)
  let hitBonusGold = 0;
  if (Math.random() < 0.3) {
    hitBonusGold = Math.floor(Math.random() * 3) + 1; // 1~3 Gold
    state.tempBonusGold[blockId] = (state.tempBonusGold[blockId] || 0) + hitBonusGold;
    state.gold += hitBonusGold;
    updateHUD();
  }

  if (isBonus) {
    const ore = (state.bonusOres || []).find(item => item.oreId === blockId);
    if (!ore) return;
    
    const blockData = state.bonusOresHp[blockId];
    blockData.hp -= equipped.power;
    ore.shakeTime = 6;
    
    // Choose particle color
    let pColor = "#fdb813"; // gold
    if (ore.name.includes("다이아몬드")) pColor = "#4dedf5";
    else if (ore.name.includes("에메랄드")) pColor = "#22c55e";
    else if (ore.name.includes("루비")) pColor = "#ef4444";
    else if (ore.name.includes("마법")) pColor = "#a78bfa";
    
    const coords = getEntityWorldCoords(ore, 'bonus_ore');
    spawnHitParticles(coords.x + TILE_SIZE/2, coords.y + TILE_SIZE/2, pColor);
    spawnFloatingText(coords.x + TILE_SIZE/2, coords.y - 12, `-${equipped.power} HP`, "#fca5a5");
    
    // Show hit gold pop-up
    if (hitBonusGold > 0) {
      spawnFloatingText(coords.x + TILE_SIZE/2 + (Math.random() - 0.5) * 24, coords.y - 25, `+${hitBonusGold} G 🪙`, "#ffd700");
    } else {
      spawnFloatingText(coords.x + TILE_SIZE/2 + (Math.random() - 0.5) * 20, coords.y - 25, `+${equipped.power * 2}🪙`, "#ffd700");
    }
    triggerCameraShake(6, 4);
    
    if (blockData.hp <= 0) {
      blockData.hp = 0;
      spawnShatterParticles(coords.x + TILE_SIZE/2, coords.y + TILE_SIZE/2, pColor);
      triggerCameraShake(14, 8);
      
      const bonusToSend = state.tempBonusGold[blockId] || 0;
      delete state.tempBonusGold[blockId];
      
      callApi('mineBonusOre', { userId: state.user.userId, oreId: blockId, bonusGold: bonusToSend })
        .then((gameData) => {
          const prevGold = state.gold;
          const goldDiff = gameData.gold - prevGold;
          if (goldDiff > 0) {
            spawnFloatingText(player.x, player.y - 40, `+${goldDiff} Gold`, "#ffd700");
            spawnFloatingText(player.x, player.y - 20, `+${ore.rewardXp} XP`, "#55ff55");
          }
          updateGameState(gameData);
        });
    }
  } else {
    const p = (state.posts || []).find(item => item.postId === blockId);
    if (!p) return;
    
    const blockData = state.postHp[blockId];
    blockData.hp -= equipped.power;
    p.shakeTime = 6;
    
    const isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor", "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(p.category) !== -1;
    const blockColor = isGreat ? "#06b6d4" : "#ef4444";
    
    const coords = getEntityWorldCoords(p, 'post');
    spawnHitParticles(coords.x + TILE_SIZE/2, coords.y + TILE_SIZE/2, blockColor);
    spawnFloatingText(coords.x + TILE_SIZE/2, coords.y - 12, `-${equipped.power} HP`, "#fca5a5");
    
    // Show hit gold pop-up or normal effect
    if (hitBonusGold > 0) {
      spawnFloatingText(coords.x + TILE_SIZE/2 + (Math.random() - 0.5) * 24, coords.y - 25, `+${hitBonusGold} G 🪙`, "#ffd700");
    } else {
      spawnFloatingText(coords.x + TILE_SIZE/2 + (Math.random() - 0.5) * 20, coords.y - 25, `Hit! 💥`, "#ffffff");
    }
    triggerCameraShake(6, 4);
    
    if (blockData.hp <= 0) {
      blockData.hp = 0;
      spawnShatterParticles(coords.x + TILE_SIZE/2, coords.y + TILE_SIZE/2, blockColor);
      triggerCameraShake(14, 8);
      openBlockDetail(blockId);
    }
  }
}

function checkInteraction() {
  // Check NPCs collision
  for (const npc of npcs) {
    const npcX = npc.tileX * TILE_SIZE;
    const npcY = npc.tileY * TILE_SIZE;
    const distance = Math.sqrt(Math.pow((player.x + player.width/2) - (npcX + TILE_SIZE/2), 2) + Math.pow((player.y + player.height) - (npcY + TILE_SIZE), 2));
    if (distance < 60) {
      openNpcDialogue(npc);
      return;
    }
  }
  
  // Check Blocks and Bonus Ores collision
  let closestBlock = null;
  let minDist = 75;
  
  // Check student blocks
  (state.posts || []).forEach(p => {
    const coords = getEntityWorldCoords(p, 'post');
    const bx = coords.x + TILE_SIZE/2;
    const by = coords.y + TILE_SIZE/2;
    const dist = Math.sqrt(Math.pow((player.x + player.width/2) - bx, 2) + Math.pow((player.y + player.height/2) - by, 2));
    if (dist < minDist) {
      closestBlock = { type: 'post', id: p.postId, data: p };
      minDist = dist;
    }
  });
  
  // Check bonus ores
  (state.bonusOres || []).forEach(ore => {
    const coords = getEntityWorldCoords(ore, 'bonus_ore');
    const bx = coords.x + TILE_SIZE/2;
    const by = coords.y + TILE_SIZE/2;
    const dist = Math.sqrt(Math.pow((player.x + player.width/2) - bx, 2) + Math.pow((player.y + player.height/2) - by, 2));
    if (dist < minDist) {
      closestBlock = { type: 'bonus_ore', id: ore.oreId, data: ore };
      minDist = dist;
    }
  });
  
  if (closestBlock) {
    if (closestBlock.type === 'post') {
      const isMined = state.postHp[closestBlock.id] && state.postHp[closestBlock.id].hp <= 0;
      if (isMined) {
        openBlockDetail(closestBlock.id);
      } else {
        mineOreBlock(closestBlock.id, false);
      }
    } else {
      const oreData = closestBlock.data;
      if (!oreData.hasMined) {
        mineOreBlock(closestBlock.id, true);
      } else {
        spawnFloatingText(player.x, player.y - 40, "이미 채굴된 보너스 원석!", "#ff5555");
      }
    }
  }
}

// Click on Canvas coordinate
function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left + camera.x;
  const clickY = e.clientY - rect.top + camera.y;
  
  // Check if click was on NPC
  for (const npc of npcs) {
    const npcX = npc.tileX * TILE_SIZE;
    const npcY = npc.tileY * TILE_SIZE;
    if (clickX >= npcX && clickX <= npcX + TILE_SIZE && clickY >= npcY && clickY <= npcY + TILE_SIZE + 16) {
      openNpcDialogue(npc);
      return;
    }
  }
  
  // Check if click was on student block
  for (const p of (state.posts || [])) {
    const coords = getEntityWorldCoords(p, 'post');
    const bx = coords.x;
    const by = coords.y;
    if (clickX >= bx && clickX <= bx + TILE_SIZE && clickY >= by && clickY <= by + TILE_SIZE) {
      if (bx > player.x) player.direction = 1;
      else player.direction = -1;
      
      const isMined = state.postHp[p.postId] && state.postHp[p.postId].hp <= 0;
      if (isMined) {
        openBlockDetail(p.postId);
      } else {
        mineOreBlock(p.postId, false);
      }
      return;
    }
  }

  // Check if click was on bonus ore
  for (const ore of (state.bonusOres || [])) {
    const coords = getEntityWorldCoords(ore, 'bonus_ore');
    const bx = coords.x;
    const by = coords.y;
    if (clickX >= bx && clickX <= bx + TILE_SIZE && clickY >= by && clickY <= by + TILE_SIZE) {
      if (bx > player.x) player.direction = 1;
      else player.direction = -1;
      
      if (!ore.hasMined) {
        mineOreBlock(ore.oreId, true);
      } else {
        spawnFloatingText(player.x, player.y - 40, "이미 채굴된 원석!", "#ff5555");
      }
      return;
    }
  }
}

// Escape HTML utility
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ==================== JUICE EFFECTS ENGINE ====================

// Camera Shake activator
function triggerCameraShake(intensity, durationFrames) {
  camera.shakeIntensity = intensity;
  camera.shakeTimer = durationFrames;
}

// Particle emitter - Stone Chips on hit
function spawnHitParticles(x, y, color) {
  const count = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    juice.particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: -2 - Math.random() * 6,
      color: color,
      size: 2 + Math.floor(Math.random() * 4),
      gravity: 0.4,
      life: 0,
      maxLife: 20 + Math.floor(Math.random() * 15)
    });
  }
}

// Particle emitter - Gems/Stars on shatter
function spawnShatterParticles(x, y, color) {
  const count = 20 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    juice.particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 10,
      vy: -4 - Math.random() * 8,
      color: i % 2 === 0 ? "#ffd700" : color, // Gold or Block Color
      size: 3 + Math.floor(Math.random() * 5),
      gravity: 0.35,
      life: 0,
      maxLife: 30 + Math.floor(Math.random() * 20),
      isGem: true
    });
  }
}

// Spawn Floating damage/points text
function spawnFloatingText(x, y, text, color) {
  juice.floatingTexts.push({
    x: x,
    y: y,
    vy: -2.5 - Math.random() * 1.5,
    text: text,
    color: color,
    size: text.includes("XP") || text.includes("Gold") ? 9 : 8,
    life: 0,
    maxLife: 45
  });
}

// Update particle actions
function updateJuice() {
  // Particles updates
  for (let i = juice.particles.length - 1; i >= 0; i--) {
    const p = juice.particles[i];
    p.x += p.vx;
    p.vy += p.gravity;
    p.y += p.vy;
    p.life++;
    
    if (p.life >= p.maxLife) {
      juice.particles.splice(i, 1);
    }
  }

  // Floating text updates
  for (let i = juice.floatingTexts.length - 1; i >= 0; i--) {
    const t = juice.floatingTexts[i];
    t.y += t.vy;
    t.vy *= 0.96; // decelerate upward velocity
    t.life++;
    
    if (t.life >= t.maxLife) {
      juice.floatingTexts.splice(i, 1);
    }
  }
}

// ==================== 2D CANVAS GAME ENGINE ====================

let gameLoopId = null;

function updatePhysics() {
  player.isMoving = false;
  
  let dx = 0;
  let dy = 0;
  
  // Horizontal movement (X-axis)
  if (keys['ArrowLeft'] || keys['KeyA']) {
    dx = -1;
    player.direction = -1;
    player.isMoving = true;
  } else if (keys['ArrowRight'] || keys['KeyD']) {
    dx = 1;
    player.direction = 1;
    player.isMoving = true;
  }
  
  // Vertical movement (Y-axis)
  if (keys['ArrowUp'] || keys['KeyW']) {
    dy = -1;
    player.isMoving = true;
  } else if (keys['ArrowDown'] || keys['KeyS']) {
    dy = 1;
    player.isMoving = true;
  }
  
  // Normalize movement vector to prevent diagonal speed boosting
  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }
  
  player.vx = dx * player.speed;
  player.vy = dy * player.speed;
  
  // Jump Height movement (Z-axis)
  if (keys['Space'] && player.z === 0) {
    player.vz = player.jumpForce;
    player.grounded = false;
  }
  
  player.vz += player.gravity;
  player.z += player.vz;
  
  // Independent X and Y axis collision checks (allows smooth wall sliding)
  const newX = player.x + player.vx;
  if (!checkWallCollision(newX, player.y)) {
    player.x = newX;
  } else {
    player.vx = 0;
  }
  
  const newY = player.y + player.vy;
  if (!checkWallCollision(player.x, newY)) {
    player.y = newY;
  } else {
    player.vy = 0;
  }
  
  // Clamp boundaries to map size minus border tiles
  player.x = Math.max(TILE_SIZE, Math.min(player.x, WORLD_WIDTH - TILE_SIZE - player.width));
  player.y = Math.max(TILE_SIZE, Math.min(player.y, WORLD_HEIGHT - TILE_SIZE - player.height));
  
  // Clamp Z height (floor level)
  if (player.z > 0) {
    player.z = 0;
    player.vz = 0;
    player.grounded = true;
  }
  
  // Camera smooth follow on both X and Y axes
  const targetCamX = player.x - canvas.width / 2;
  const targetCamY = player.y - canvas.height / 2;
  camera.x += (targetCamX - camera.x) * camera.lerpSpeed;
  camera.y += (targetCamY - camera.y) * camera.lerpSpeed;
  camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - canvas.width));
  camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT - canvas.height));
  
  // Camera Shake trigger math
  if (camera.shakeTimer > 0) {
    camera.shakeTimer--;
    camera.shakeX = (Math.random() - 0.5) * camera.shakeIntensity;
    camera.shakeY = (Math.random() - 0.5) * camera.shakeIntensity;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
  }
  
  // Walk animations
  if (player.isMoving && player.z === 0) {
    player.animTimer++;
    if (player.animTimer > 8) {
      player.animFrame = (player.animFrame + 1) % 4;
      player.animTimer = 0;
    }
  } else {
    player.animFrame = 0;
  }
  
  // Pickaxe swing animation timer
  if (player.isSwinging) {
    player.swingTimer--;
    player.swingAngle += Math.PI / 10;
    if (player.swingTimer <= 0) {
      player.isSwinging = false;
      player.swingAngle = 0;
    }
  }
  
  // Block shaking timer reduction
  (state.posts || []).forEach(p => {
    if (p.shakeTime && p.shakeTime > 0) p.shakeTime--;
  });
  (state.bonusOres || []).forEach(o => {
    if (o.shakeTime && o.shakeTime > 0) o.shakeTime--;
  });
  
  updateJuice();
}

function draw3DCube(x, y, w, h, d, faceColor, topColor, sideColor, cracksRatio, hasMined, isGreat, name, labelText) {
  if (hasMined) {
    const coreColor = isGreat ? "#4dedf5" : "#ff5555";
    if (faceColor === "#5d4a13") {
      ctx.fillStyle = "rgba(253, 184, 19, 0.15)";
    } else {
      ctx.fillStyle = isGreat ? "rgba(34, 211, 238, 0.15)" : "rgba(239, 68, 68, 0.15)";
    }
    
    ctx.beginPath();
    ctx.arc(x + w/2, y + h/2, 24, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = (faceColor === "#5d4a13") ? "#fdb813" : coreColor;
    ctx.beginPath();
    ctx.moveTo(x + w/2, y + 8);
    ctx.lineTo(x + w - 10, y + h/2);
    ctx.lineTo(x + w/2, y + h - 8);
    ctx.lineTo(x + 10, y + h/2);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    ctx.fillStyle = "#fff";
    if (Math.random() < 0.1) {
      ctx.fillRect(x + 12 + Math.random() * 24, y + 12 + Math.random() * 24, 3, 3);
    }
  } else {
    // 1. Top Face
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + d, y - d);
    ctx.lineTo(x + w + d, y - d);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 2. Right Side Face
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + d, y - d);
    ctx.lineTo(x + w + d, y + h - d);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // 3. Front Face
    ctx.fillStyle = faceColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    
    // Glowing gems
    ctx.fillStyle = isGreat ? "#4dedf5" : "#ff5555";
    if (faceColor === "#5d4a13") ctx.fillStyle = "#fdb813";
    else if (faceColor === "#0d3a1b") ctx.fillStyle = "#22c55e";
    else if (faceColor === "#2e1065") ctx.fillStyle = "#a78bfa";
    
    ctx.fillRect(x + 10, y + 12, 8, 8);
    ctx.fillRect(x + 28, y + 26, 10, 10);
    ctx.fillRect(x + 14, y + 32, 6, 6);
    
    // Cracks
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.lineWidth = 3.5;
    if (cracksRatio <= 0.8 && cracksRatio > 0.5) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + 20, y + 20);
      ctx.stroke();
    } else if (cracksRatio <= 0.5 && cracksRatio > 0.25) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + 20, y + 20);
      ctx.moveTo(x + 44, y + 6);
      ctx.lineTo(x + 28, y + 28);
      ctx.stroke();
    } else if (cracksRatio <= 0.25) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + 24, y + 24);
      ctx.lineTo(x + 8, y + 44);
      ctx.moveTo(x + 44, y + 4);
      ctx.lineTo(x + 24, y + 24);
      ctx.stroke();
    }
    
    // Health Bar
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 4, y - 8, 40, 5);
    const hpWidth = Math.floor(40 * cracksRatio);
    ctx.fillStyle = (faceColor === "#5d4a13") ? "#fdb813" : (isGreat ? "#4dedf5" : "#ff5555");
    if (faceColor === "#0d3a1b") ctx.fillStyle = "#22c55e";
    if (faceColor === "#2e1065") ctx.fillStyle = "#a78bfa";
    ctx.fillRect(x + 4, y - 8, hpWidth, 5);
  }
  
  // Label Card
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(x - 20, y - 36, w + 40, 24);
  ctx.strokeStyle = hasMined ? "#55ff55" : (isGreat ? "#4dedf5" : "#ff5555");
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 20, y - 36, w + 40, 24);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 8px var(--font-retro)";
  ctx.textAlign = "center";
  ctx.fillText(name, x + w/2, y - 26);
  
  ctx.fillStyle = hasMined ? "#55ff55" : "#aaaaaa";
  ctx.font = "6px var(--font-retro)";
  ctx.fillText(labelText, x + w/2, y - 16);
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Calculate viewport boundaries (optimization for rendering only what is visible)
  const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const endCol = Math.min(MAP_SIZE - 1, Math.floor((camera.x + canvas.width) / TILE_SIZE));
  const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endRow = Math.min(MAP_SIZE - 1, Math.floor((camera.y + canvas.height) / TILE_SIZE));
  
  ctx.save();
  ctx.translate(-camera.x + camera.shakeX, -camera.y + camera.shakeY);
  
  // Floor Rendering (viewport optimized)
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const tx = c * TILE_SIZE;
      const ty = r * TILE_SIZE;
      
      // Draw grid stone tiles (Mine Knights cavern style)
      ctx.fillStyle = (c === 30) ? "#1f2937" : ((c + r) % 2 === 0 ? "#1e293b" : "#111827");
      ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
    }
  }
  
  // 2.5D Depth Sorting List
  const drawables = [];
  
  // Add static Solid Wall columns inside the viewport
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (mapGrid[r][c] === 1) {
        drawables.push({
          type: 'wall',
          x: c * TILE_SIZE,
          y: r * TILE_SIZE + TILE_SIZE, // Base line for sorting
          tileX: c,
          tileY: r
        });
      }
    }
  }
  
  // Add NPCs
  npcs.forEach(npc => {
    const nx = npc.tileX * TILE_SIZE;
    const ny = npc.tileY * TILE_SIZE;
    if (nx + TILE_SIZE >= camera.x && nx <= camera.x + canvas.width &&
        ny + TILE_SIZE >= camera.y && ny <= camera.y + canvas.height) {
      drawables.push({
        type: 'npc',
        y: ny + TILE_SIZE,
        data: npc
      });
    }
  });
  
  // Add Posts (student blocks)
  (state.posts || []).forEach(p => {
    const coords = getEntityWorldCoords(p, 'post');
    if (coords.x + TILE_SIZE >= camera.x && coords.x <= camera.x + canvas.width &&
        coords.y + TILE_SIZE >= camera.y && coords.y <= camera.y + canvas.height) {
      drawables.push({
        type: 'post',
        y: coords.y + TILE_SIZE,
        data: p
      });
    }
  });
  
  // Add Bonus Ores
  (state.bonusOres || []).forEach(ore => {
    const coords = getEntityWorldCoords(ore, 'bonus_ore');
    if (coords.x + TILE_SIZE >= camera.x && coords.x <= camera.x + canvas.width &&
        coords.y + TILE_SIZE >= camera.y && coords.y <= camera.y + canvas.height) {
      drawables.push({
        type: 'bonus_ore',
        y: coords.y + TILE_SIZE,
        data: ore
      });
    }
  });
  
  // Add Player
  drawables.push({
    type: 'player',
    y: player.y + player.height,
    data: player
  });
  
  // Sort draw list by depth (Y coordinate)
  drawables.sort((a, b) => a.y - b.y);
  
  // Render items in sorted order
  drawables.forEach(item => {
    if (item.type === 'wall') {
      const wx = item.x;
      const wy = item.y - TILE_SIZE;
      
      // Bottom/Front face
      ctx.fillStyle = "#374151";
      ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, TILE_SIZE, TILE_SIZE);
      
      // Top face (lighter stone block)
      ctx.fillStyle = "#4b5563";
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 8, wy - 8);
      ctx.lineTo(wx + TILE_SIZE + 8, wy - 8);
      ctx.lineTo(wx + TILE_SIZE, wy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Side face (darker)
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.moveTo(wx + TILE_SIZE, wy);
      ctx.lineTo(wx + TILE_SIZE + 8, wy - 8);
      ctx.lineTo(wx + TILE_SIZE + 8, wy + TILE_SIZE - 8);
      ctx.lineTo(wx + TILE_SIZE, wy + TILE_SIZE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
    } else if (item.type === 'npc') {
      const npc = item.data;
      const nx = npc.tileX * TILE_SIZE;
      const ny = npc.tileY * TILE_SIZE;
      
      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.ellipse(nx + TILE_SIZE/2, ny + TILE_SIZE - 4, TILE_SIZE/2 - 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body
      ctx.fillStyle = "#475569";
      ctx.fillRect(nx + 6, ny + 14, TILE_SIZE - 12, TILE_SIZE - 14);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeRect(nx + 6, ny + 14, TILE_SIZE - 12, TILE_SIZE - 14);
      
      // Head
      ctx.fillStyle = "#e5c59e";
      ctx.fillRect(nx + 10, ny - 2, TILE_SIZE - 20, 16);
      ctx.strokeRect(nx + 10, ny - 2, TILE_SIZE - 20, 16);
      
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(npc.emoji, nx + TILE_SIZE/2, ny + 6);
      
      // Name Tag
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(nx - 10, ny - 32, TILE_SIZE + 20, 15);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px var(--font-retro)";
      ctx.textAlign = "center";
      ctx.fillText(npc.name.split(' ')[0], nx + TILE_SIZE/2, ny - 23);
      
      // Quest status indicator
      const quest = (state.quests || []).find(q => q.questType === npc.id);
      const progress = quest ? Number(quest.progress) : 0;
      const status = quest ? quest.status : "IN_PROGRESS";
      
      let target = 1;
      if (npc.id === "READ_3") target = 3;
      else if (npc.id === "LIKE_5") target = 5;
      else if (npc.id === "COMMENT_2") target = 2;
      
      if (status === "COMPLETED") {
        ctx.fillStyle = "#55ff55";
        ctx.font = "bold 16px var(--font-retro)";
        ctx.fillText("✔", nx + TILE_SIZE/2, ny - 42);
      } else if (progress >= target) {
        ctx.fillStyle = "#ffff55";
        ctx.font = "bold 16px var(--font-retro)";
        ctx.fillText("?", nx + TILE_SIZE/2, ny - 42);
      } else {
        ctx.fillStyle = "#ff5555";
        ctx.font = "bold 16px var(--font-retro)";
        ctx.fillText("!", nx + TILE_SIZE/2, ny - 42);
      }
      
    } else if (item.type === 'post') {
      const p = item.data;
      const coords = getEntityWorldCoords(p, 'post');
      const bx = coords.x;
      const by = coords.y;
      
      const isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor", "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(p.category) !== -1;
      const blockData = state.postHp[p.postId] || { hp: 5, maxHp: 5 };
      const isMined = blockData.hp <= 0;
      
      let shakeOffset = 0;
      if (p.shakeTime && p.shakeTime > 0) {
        shakeOffset = (p.shakeTime % 2 === 0 ? 1 : -1) * 4;
      }
      
      const title = p.title || "무명 - 인물 카드";
      const personName = title.includes('-') ? title.split('-')[0].trim() : title.trim();
      const oreStatusText = isMined ? "완료(F)" : `채굴(F) H:${blockData.hp}`;
      
      const faceColor = isGreat ? "#0b4e5b" : "#4c0505";
      const topColor = isGreat ? "#137487" : "#720d0d";
      const sideColor = isGreat ? "#05272e" : "#280303";
      
      draw3DCube(
        bx + shakeOffset, by, TILE_SIZE, TILE_SIZE, 8,
        faceColor, topColor, sideColor,
        blockData.hp / (blockData.maxHp || 5), isMined, isGreat,
        personName, oreStatusText
      );
      
    } else if (item.type === 'bonus_ore') {
      const ore = item.data;
      const coords = getEntityWorldCoords(ore, 'bonus_ore');
      const bx = coords.x;
      const by = coords.y;
      const isMined = ore.hasMined;
      const blockData = state.bonusOresHp[ore.oreId] || { hp: 5, maxHp: 5 };
      
      let shakeOffset = 0;
      if (ore.shakeTime && ore.shakeTime > 0) {
        shakeOffset = (ore.shakeTime % 2 === 0 ? 1 : -1) * 4;
      }
      
      let faceColor = "#5d4a13";
      let topColor = "#8f731d";
      let sideColor = "#3d300b";
      
      if (ore.name.includes("다이아몬드")) {
        faceColor = "#1f353a"; topColor = "#2e4f57"; sideColor = "#111d20";
      } else if (ore.name.includes("에메랄드")) {
        faceColor = "#0d3a1b"; topColor = "#165f2c"; sideColor = "#061d0d";
      } else if (ore.name.includes("루비")) {
        faceColor = "#3f0c10"; topColor = "#63131a"; sideColor = "#1f0507";
      } else if (ore.name.includes("마법")) {
        faceColor = "#2e1065"; topColor = "#4c1d95"; sideColor = "#1e1b4b";
      }
      
      const oreStatusText = isMined ? "완료(F)" : `보너스(F) H:${blockData.hp}`;
      
      draw3DCube(
        bx + shakeOffset, by, TILE_SIZE, TILE_SIZE, 8,
        faceColor, topColor, sideColor,
        blockData.hp / (blockData.maxHp || 5), isMined, true,
        ore.name, oreStatusText
      );
      
    } else if (item.type === 'player') {
      const px = player.x;
      const py = player.y + player.z; // Apply jump height offset (Z axis)
      
      // Shadow (drawn flat on Y ground plane)
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.ellipse(px + player.width/2, player.y + player.height - 4, player.width/2 - 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body
      ctx.fillStyle = "#1e88e5";
      ctx.fillRect(px, py + 16, player.width, 28);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py + 16, player.width, 28);
      
      // Legs walk
      ctx.fillStyle = "#0d47a1";
      if (player.isMoving && player.z === 0) {
        if (player.animFrame % 2 === 0) {
          ctx.fillRect(px + 2, py + 38, 8, 8);
          ctx.strokeRect(px + 2, py + 38, 8, 8);
          ctx.fillRect(px + 14, py + 34, 8, 8);
          ctx.strokeRect(px + 14, py + 34, 8, 8);
        } else {
          ctx.fillRect(px + 2, py + 34, 8, 8);
          ctx.strokeRect(px + 2, py + 34, 8, 8);
          ctx.fillRect(px + 14, py + 38, 8, 8);
          ctx.strokeRect(px + 14, py + 38, 8, 8);
        }
      } else {
        ctx.fillRect(px + 2, py + 38, 8, 8);
        ctx.strokeRect(px + 2, py + 38, 8, 8);
        ctx.fillRect(px + 14, py + 38, 8, 8);
        ctx.strokeRect(px + 14, py + 38, 8, 8);
      }
      
      // Head
      ctx.fillStyle = "#ffcc80";
      ctx.fillRect(px + 2, py, 20, 18);
      ctx.strokeRect(px + 2, py, 20, 18);
      
      // Hair & Eyes
      ctx.fillStyle = "#5d4037";
      ctx.fillRect(px + 2, py, 20, 6);
      ctx.fillStyle = "#000000";
      if (player.direction === 1) {
        ctx.fillRect(px + 14, py + 8, 3, 3);
        ctx.fillRect(px + 18, py + 8, 3, 3);
      } else {
        ctx.fillRect(px + 4, py + 8, 3, 3);
        ctx.fillRect(px + 8, py + 8, 3, 3);
      }
      
      // Pickaxe Swing rotation
      const equipped = getEquippedPickaxe();
      if (player.isSwinging) {
        ctx.save();
        const armX = px + (player.direction === 1 ? player.width : 0);
        const armY = py + 22;
        ctx.translate(armX, armY);
        
        const finalAngle = player.direction === 1 ? player.swingAngle : -player.swingAngle - Math.PI;
        ctx.rotate(finalAngle);
        
        // Wood Shaft
        ctx.strokeStyle = "#854d0e";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -28);
        ctx.stroke();
        
        // Voxel Head
        ctx.fillStyle = equipped.color;
        ctx.beginPath();
        ctx.moveTo(-14, -28);
        ctx.lineTo(14, -28);
        ctx.lineTo(10, -23);
        ctx.lineTo(-10, -23);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        
        ctx.restore();
      }
    }
  });
  
  // 9. Draw Particle FX
  juice.particles.forEach(p => {
    ctx.fillStyle = p.color;
    if (p.isGem) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.size);
      ctx.lineTo(p.x + p.size, p.y);
      ctx.lineTo(p.x, p.y + p.size);
      ctx.lineTo(p.x - p.size, p.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
  });
  
  // 10. Draw Bouncing Floating text
  juice.floatingTexts.forEach(t => {
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px var(--font-retro)`;
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeText(t.text, t.x, t.y);
  });
  
  ctx.restore();
}

function gameLoop() {
  updatePhysics();
  drawGame();
  gameLoopId = requestAnimationFrame(gameLoop);
}

function gameLoop() {
  updatePhysics();
  drawGame();
  gameLoopId = requestAnimationFrame(gameLoop);
}

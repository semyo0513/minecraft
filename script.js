/**
 * Minecraft style Educational Game - Client Side Static Script (script.js)
 * Interacts with Google Apps Script Web App API using Fetch CORS calls.
 */

// Global Game State
const state = {
  user: null,
  xp: 0,
  level: 1,
  posts: [],
  badges: [],
  quests: [],
  recommendedPost: null,
  recommendedShown: false
};

// Canvas Engine Configuration
let canvas, ctx;
const TILE_SIZE = 32; // pixel size of one grid block
const WORLD_UNITS = 1000; // Total horizontal grid tiles
const WORLD_WIDTH = WORLD_UNITS * TILE_SIZE; // 32,000 pixels
let GROUND_Y = 0; // Calculated on canvas resize

// Player Object
const player = {
  x: 100 * TILE_SIZE, // Start at Great Person Town
  y: 0,
  vx: 0,
  vy: 0,
  width: 24,
  height: 44,
  speed: 6,
  jumpForce: -13,
  gravity: 0.6,
  grounded: false,
  direction: 1, // 1 = right, -1 = left
  animFrame: 0,
  animTimer: 0,
  isMoving: false
};

// Camera Object
const camera = {
  x: 0,
  y: 0,
  lerpSpeed: 0.1
};

// Static NPCs list
const npcs = [
  { id: "READ_3", name: "기록가 할아버지", unitX: 100, emoji: "👴", questTitle: "독서 입문자", questDesc: "친구들의 인물 블록 3개를 찾아서 읽어보세요.", rewardXp: 50, rewardBadge: "독서 입문자" },
  { id: "LIKE_5", name: "마을 선생님", unitX: 250, emoji: "👩‍🏫", questTitle: "공감의 요정", questDesc: "친구들의 인물 블록에 좋아요를 5회 눌러주세요.", rewardXp: 30, rewardBadge: "공감의 요정" },
  { id: "COMMENT_2", name: "도서관 사서", unitX: 400, emoji: "🧙‍♂️", questTitle: "친절한 이웃", questDesc: "친구들의 인물 블록에 친절한 댓글을 2개 남겨보세요.", rewardXp: 40, rewardBadge: "친절한 이웃" },
  { id: "FIND_GREAT", name: "환경 지킴이", unitX: 620, emoji: "👨‍🌾", questTitle: "역사 탐험가", questDesc: "위대한 인물 마을(x: 0~500)의 인물 블록을 1개 찾아 읽으세요.", rewardXp: 50, rewardBadge: "역사 탐험가" },
  { id: "FIND_POOR", name: "복지 활동가", unitX: 820, emoji: "👩‍⚕️", questTitle: "따뜻한 시선", questDesc: "소외된 인물 마을(x: 501~1000)의 인물 블록을 1개 찾아 읽으세요.", rewardXp: 50, rewardBadge: "따뜻한 시선" }
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

// Helper: Make Fetch API request using GET (to bypass CORS preflight OPTIONS block on GAS)
function callApi(action, params = {}) {
  const apiUrl = localStorage.getItem('mc_api_url');
  if (!apiUrl) {
    openModal('modal-api-settings');
    return Promise.reject(new Error("API URL not configured"));
  }

  // Compile search query string
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
  
  // Resize handler
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
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnAction = document.getElementById('btn-action');

  btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowLeft'] = true; });
  btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowLeft'] = false; });
  btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowRight'] = true; });
  btnRight.addEventListener('touchend', (e) => { e.preventDefault(); keys['ArrowRight'] = false; });
  btnAction.addEventListener('touchstart', (e) => { e.preventDefault(); checkInteraction(); });

  if (!('ontouchstart' in window)) {
    document.getElementById('mobile-controller').classList.add('hidden');
  }

  canvas.addEventListener('click', handleCanvasClick);
}

// Check if API URL is set and verify local session
function checkApiAndSession() {
  const apiUrl = localStorage.getItem('mc_api_url');
  if (!apiUrl) {
    // Show login page, but force open settings modal
    showScreen('screen-login');
    openModal('modal-api-settings');
  } else {
    checkSession();
  }
}

// Save API URL configuration and trigger database check
function saveApiUrlSettings() {
  let urlVal = document.getElementById('api-url-input').value.trim();
  if (!urlVal) {
    alert("구글 앱스 스크립트 웹앱 주소를 입력하세요.");
    return;
  }

  // Store in cache
  localStorage.setItem('mc_api_url', urlVal);
  closeModal('modal-api-settings');
  
  // Verify API by running setup check
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

// Load spreadsheet database items
function loadGameData() {
  showScreen('screen-loading');
  document.getElementById('loading-message').innerText = "마을 환경과 블록들을 로드하고 있습니다...";
  
  callApi('getGameData', { userId: state.user.userId })
    .then((gameData) => {
      state.xp = gameData.xp;
      state.level = gameData.level;
      state.posts = gameData.posts;
      state.badges = gameData.badges;
      state.quests = gameData.quests;
      state.recommendedPost = gameData.recommendedPost;
      
      updateHUD();
      showScreen('screen-game');
      
      // Start Game loop
      if (!gameLoopId) {
        player.y = GROUND_Y - player.height;
        gameLoopId = requestAnimationFrame(gameLoop);
      }
      
      if (state.recommendedPost && !state.recommendedShown) {
        state.recommendedShown = true;
        setTimeout(showRecommendationCard, 800);
      }
    })
    .catch((err) => {
      console.error(err);
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
  
  const currentLvlMin = Math.pow(state.level - 1, 2) * 100;
  const nextLvlMin = Math.pow(state.level, 2) * 100;
  const levelXpGained = state.xp - currentLvlMin;
  const levelXpRequired = nextLvlMin - currentLvlMin;
  
  const xpPercent = Math.min(100, Math.max(0, (levelXpGained / levelXpRequired) * 100));
  document.getElementById('hud-xp-fill').style.width = xpPercent + '%';
  document.getElementById('hud-xp-text').innerText = `${state.xp} / ${nextLvlMin} XP`;
}

function teleportPlayer(unitX) {
  player.x = unitX * TILE_SIZE;
  player.vx = 0;
  player.vy = 0;
  camera.x = player.x - canvas.width / 2;
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
    
    state.xp = gameData.xp;
    state.level = gameData.level;
    state.posts = gameData.posts;
    state.badges = gameData.badges;
    state.quests = gameData.quests;
    
    updateHUD();
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
    const unlocked = state.badges.includes(bName);
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
  document.getElementById('recom-title').innerText = p.title;
  document.getElementById('recom-name').innerText = p.title.split('-')[0].trim();
  document.getElementById('recom-author').innerText = p.author;
  document.getElementById('recom-image').src = p.imageUrl;
  document.getElementById('recom-summary').innerText = p.summary;
  
  openModal('modal-recommendation');
}

// Open block details modal
let selectedPostId = null;
function openBlockDetail(postId) {
  const p = state.posts.find(item => item.postId === postId);
  if (!p) return;
  
  selectedPostId = postId;
  
  document.getElementById('detail-title').innerText = p.title;
  document.getElementById('detail-name').innerText = p.title.split('-')[0].trim();
  document.getElementById('detail-category').innerText = p.category;
  document.getElementById('detail-author').innerText = p.author;
  document.getElementById('detail-image').src = p.imageUrl;
  document.getElementById('detail-summary').innerText = p.summary;
  document.getElementById('detail-paragraph').innerText = p.paragraph;
  document.getElementById('detail-view-count').innerText = p.viewsCount;
  document.getElementById('detail-like-count').innerText = p.likesCount;
  
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
  
  // Record view logic
  callApi('readBlock', { userId: state.user.userId, postId: postId })
    .then((gameData) => {
      state.xp = gameData.xp;
      state.level = gameData.level;
      state.posts = gameData.posts;
      state.badges = gameData.badges;
      state.quests = gameData.quests;
      updateHUD();
      
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
    state.xp = gameData.xp;
    state.level = gameData.level;
    state.posts = gameData.posts;
    state.badges = gameData.badges;
    state.quests = gameData.quests;
    
    updateHUD();
    renderCommentsList(selectedPostId);
  });
}

function handleLikeToggle() {
  if (!selectedPostId) return;
  
  callApi('toggleLike', { userId: state.user.userId, postId: selectedPostId })
    .then((gameData) => {
      state.xp = gameData.xp;
      state.level = gameData.level;
      state.posts = gameData.posts;
      state.badges = gameData.badges;
      state.quests = gameData.quests;
      
      updateHUD();
      
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
  
  const quest = state.quests.find(q => q.questType === npc.id);
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
          state.xp = gameData.xp;
          state.level = gameData.level;
          state.posts = gameData.posts;
          state.badges = gameData.badges;
          state.quests = gameData.quests;
          updateHUD();
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

function checkInteraction() {
  for (const npc of npcs) {
    const npcX = npc.unitX * TILE_SIZE;
    const distance = Math.abs(player.x - npcX);
    if (distance < 50) {
      openNpcDialogue(npc);
      return;
    }
  }
  
  let closestBlock = null;
  let minDist = 50;
  for (const p of state.posts) {
    const blockX = p.x * TILE_SIZE;
    const distance = Math.abs(player.x - blockX);
    if (distance < minDist) {
      closestBlock = p;
      minDist = distance;
    }
  }
  if (closestBlock) {
    openBlockDetail(closestBlock.postId);
  }
}

function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left + camera.x;
  
  for (const npc of npcs) {
    const npcX = npc.unitX * TILE_SIZE;
    const npcWidth = 32;
    const npcY = GROUND_Y - 48;
    if (clickX >= npcX - 16 && clickX <= npcX + 32 && e.clientY - rect.top >= npcY && e.clientY - rect.top <= GROUND_Y) {
      openNpcDialogue(npc);
      return;
    }
  }
  
  for (const p of state.posts) {
    const blockX = p.x * TILE_SIZE;
    const blockY = GROUND_Y - 48;
    if (clickX >= blockX && clickX <= blockX + 48 && e.clientY - rect.top >= blockY && e.clientY - rect.top <= GROUND_Y) {
      openBlockDetail(p.postId);
      return;
    }
  }
}

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

// ==================== 2D CANVAS GAME ENGINE ====================

let gameLoopId = null;

function updatePhysics() {
  player.isMoving = false;
  
  if (keys['ArrowLeft'] || keys['KeyA']) {
    player.vx = -player.speed;
    player.direction = -1;
    player.isMoving = true;
  } else if (keys['ArrowRight'] || keys['KeyD']) {
    player.vx = player.speed;
    player.direction = 1;
    player.isMoving = true;
  } else {
    player.vx *= 0.7;
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }
  
  if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && player.grounded) {
    player.vy = player.jumpForce;
    player.grounded = false;
  }
  
  player.vy += player.gravity;
  
  player.x += player.vx;
  player.y += player.vy;
  
  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }
  if (player.x > WORLD_WIDTH - player.width) {
    player.x = WORLD_WIDTH - player.width;
    player.vx = 0;
  }
  
  if (player.y > GROUND_Y - player.height) {
    player.y = GROUND_Y - player.height;
    player.vy = 0;
    player.grounded = true;
  }
  
  const targetCamX = player.x - canvas.width / 2;
  camera.x += (targetCamX - camera.x) * camera.lerpSpeed;
  camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - canvas.width));
  
  if (player.isMoving && player.grounded) {
    player.animTimer++;
    if (player.animTimer > 8) {
      player.animFrame = (player.animFrame + 1) % 4;
      player.animTimer = 0;
    }
  } else {
    player.animFrame = 0;
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  skyGrad.addColorStop(0, "#5b90f6");
  skyGrad.addColorStop(1, "#94bbfd");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, GROUND_Y);
  
  ctx.save();
  ctx.translate(-camera.x, 0);
  
  // Parallax Sun
  ctx.fillStyle = "#fff7a3";
  ctx.fillRect(400 - camera.x * 0.1, 80, 48, 48);
  ctx.strokeStyle = "#ffc03d";
  ctx.lineWidth = 4;
  ctx.strokeRect(400 - camera.x * 0.1, 80, 48, 48);
  
  // Parallax Clouds
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  const cloudOffset = -camera.x * 0.2;
  for (let i = 0; i < 20; i++) {
    const cx = (i * 1200) + cloudOffset;
    ctx.fillRect(cx, 100, 120, 32);
    ctx.fillRect(cx + 20, 84, 80, 16);
  }
  
  // Town Border Divider (x = 500)
  const borderX = 500 * TILE_SIZE;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(borderX, 0);
  ctx.lineTo(borderX, GROUND_Y);
  ctx.stroke();
  
  // Border Signboard
  ctx.fillStyle = "#8a572a";
  ctx.fillRect(borderX - 90, GROUND_Y - 120, 180, 40);
  ctx.fillStyle = "#000";
  ctx.fillRect(borderX - 90, GROUND_Y - 120, 180, 40);
  ctx.strokeStyle = "#c6c6c6";
  ctx.lineWidth = 3;
  ctx.strokeRect(borderX - 90, GROUND_Y - 120, 180, 40);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 9px var(--font-retro)";
  ctx.textAlign = "center";
  ctx.fillText("← 위대한 마을 | 소외된 마을 →", borderX, GROUND_Y - 100);
  
  // Sign Post Stick
  ctx.fillStyle = "#634731";
  ctx.fillRect(borderX - 8, GROUND_Y - 80, 16, 80);
  
  // Ground
  ctx.fillStyle = "#55aa55";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 12);
  ctx.fillStyle = "#805b36";
  ctx.fillRect(0, GROUND_Y + 12, WORLD_WIDTH, 96 - 12);
  
  ctx.fillStyle = "#449944";
  for (let gx = 0; gx < WORLD_WIDTH; gx += TILE_SIZE) {
    ctx.fillRect(gx, GROUND_Y, 2, 12);
  }
  
  // Draw NPCs
  npcs.forEach(npc => {
    const npcX = npc.unitX * TILE_SIZE;
    const npcY = GROUND_Y - 48;
    
    ctx.fillStyle = "#ab7f56";
    ctx.fillRect(npcX, npcY + 16, 32, 32);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeRect(npcX, npcY + 16, 32, 32);
    
    ctx.fillStyle = "#e5c59e";
    ctx.fillRect(npcX + 4, npcY, 24, 20);
    ctx.strokeRect(npcX + 4, npcY, 24, 20);
    
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(npc.emoji, npcX + 16, npcY + 10);
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(npcX - 16, npcY - 32, 64, 16);
    ctx.fillStyle = "#ffffff";
    ctx.font = "8px var(--font-retro)";
    ctx.textAlign = "center";
    ctx.fillText(npc.name.split(' ')[0], npcX + 16, npcY - 21);
    
    const quest = state.quests.find(q => q.questType === npc.id);
    const progress = quest ? Number(quest.progress) : 0;
    const status = quest ? quest.status : "IN_PROGRESS";
    
    let target = 1;
    if (npc.id === "READ_3") target = 3;
    else if (npc.id === "LIKE_5") target = 5;
    else if (npc.id === "COMMENT_2") target = 2;
    
    if (status === "COMPLETED") {
      ctx.fillStyle = "#55ff55";
      ctx.font = "bold 18px var(--font-retro)";
      ctx.fillText("✔", npcX + 16, npcY - 42);
    } else if (progress >= target) {
      ctx.fillStyle = "#ffff55";
      ctx.font = "bold 18px var(--font-retro)";
      ctx.fillText("?", npcX + 16, npcY - 42);
    } else {
      ctx.fillStyle = "#ff5555";
      ctx.font = "bold 18px var(--font-retro)";
      ctx.fillText("!", npcX + 16, npcY - 42);
    }
  });
  
  // Draw Block Posts
  state.posts.forEach(p => {
    const bx = p.x * TILE_SIZE;
    const by = GROUND_Y - 48;
    
    const isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor",
                     "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(p.category) !== -1;
    
    const blockColor = isGreat ? "#4dedf5" : "#ff5555";
    const topColor = isGreat ? "#ffffff" : "#aa3a3a";
    
    ctx.fillStyle = blockColor;
    ctx.fillRect(bx, by, 48, 48);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, 48, 48);
    
    ctx.fillStyle = topColor;
    ctx.fillRect(bx + 4, by + 4, 40, 10);
    
    const personName = p.title.split('-')[0].trim();
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(bx - 20, by - 40, 88, 26);
    ctx.strokeStyle = isGreat ? "var(--mc-diamond)" : "var(--mc-red)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 20, by - 40, 88, 26);
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 8px var(--font-retro)";
    ctx.textAlign = "center";
    ctx.fillText(personName, bx + 24, by - 29);
    
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "6px var(--font-retro)";
    ctx.fillText(`♥${p.likesCount} 👁${p.viewsCount}`, bx + 24, by - 18);
  });
  
  // Draw Player
  const px = player.x;
  const py = player.y;
  
  ctx.fillStyle = "#1e88e5";
  ctx.fillRect(px, py + 16, player.width, 28);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py + 16, player.width, 28);
  
  ctx.fillStyle = "#0d47a1";
  if (player.isMoving && player.grounded) {
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
  
  ctx.fillStyle = "#ffcc80";
  ctx.fillRect(px + 2, py, 20, 18);
  ctx.strokeRect(px + 2, py, 20, 18);
  
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
  
  ctx.restore();
}

function gameLoop() {
  updatePhysics();
  drawGame();
  gameLoopId = requestAnimationFrame(gameLoop);
}

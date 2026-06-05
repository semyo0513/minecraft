/**
 * Minecraft style Educational Game - Backend Controller (Code.gs)
 * Integrated with Google Sheets as a database.
 */

// Route user requests
function doGet(e) {
  var page = e.parameter.page;
  var template;
  if (page === 'admin') {
    template = HtmlService.createTemplateFromFile('Admin');
  } else {
    template = HtmlService.createTemplateFromFile('Index');
  }
  
  return template.evaluate()
    .setTitle("Minecraft Educational World")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include partial files (Style, Script) in templates
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Get or auto-generate Spreadsheet database
function getSpreadsheet() {
  var properties = PropertiesService.getScriptProperties();
  var sheetId = properties.getProperty('SPREADSHEET_ID');
  
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (err) {
      // If the sheet was deleted or access lost, create a new one
      Logger.log("Stored spreadsheet ID invalid. Re-creating: " + err.message);
    }
  }
  
  // Try active spreadsheet first (in case it is container-bound)
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      properties.setProperty('SPREADSHEET_ID', active.getId());
      return active;
    }
  } catch (err) {
    Logger.log("Container-bound active spreadsheet not found. Creating a standalone file.");
  }
  
  // Create a new standalone spreadsheet in Google Drive
  var newSpreadsheet = SpreadsheetApp.create('Minecraft_Edu_Game_Database');
  properties.setProperty('SPREADSHEET_ID', newSpreadsheet.getId());
  return newSpreadsheet;
}

// Auto-initialize sheets and headers if they do not exist
function initDatabase() {
  var ss = getSpreadsheet();
  
  var sheetsConfig = {
    "Users": ["userId", "nickname", "joinedDate"],
    "Posts": ["postId", "category", "author", "title", "summary", "paragraph", "imageUrl", "x", "y", "createdDate"],
    "Views": ["viewId", "postId", "userId", "viewedDate"],
    "Likes": ["likeId", "postId", "userId", "likedDate"],
    "Comments": ["commentId", "postId", "user", "comment", "date"],
    "XP": ["xpId", "userId", "xpChange", "reason", "timestamp"],
    "Badges": ["badgeId", "userId", "badgeType", "date"],
    "Quests": ["questId", "userId", "questType", "status", "progress", "completedDate"],
    "Settings": ["key", "value"]
  };
  
  for (var sheetName in sheetsConfig) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheetsConfig[sheetName]);
      
      // Formatting headers
      var headerRange = sheet.getRange(1, 1, 1, sheetsConfig[sheetName].length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#374151");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  }
  
  // Default Settings
  var settingsSheet = ss.getSheetByName("Settings");
  var data = settingsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    settingsSheet.appendRow(["total_students", "30"]);
    settingsSheet.appendRow(["recommended_post_id", ""]);
    settingsSheet.appendRow(["recommended_date", ""]);
  }
  
  return ss.getUrl();
}

// Helper to convert sheet data to array of JSON objects
function getSheetDataAsJson(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length <= 1) return [];
  
  var headers = values[0];
  var jsonArray = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    jsonArray.push(obj);
  }
  return jsonArray;
}

// User login / Registration
function registerOrLoginUser(nickname) {
  initDatabase();
  nickname = nickname.trim();
  if (!nickname) throw new Error("Nickname cannot be empty");
  
  var ss = getSpreadsheet();
  var userSheet = ss.getSheetByName("Users");
  var users = getSheetDataAsJson("Users");
  
  var matchedUser = users.find(function(u) {
    return u.nickname.toLowerCase() === nickname.toLowerCase();
  });
  
  if (matchedUser) {
    return matchedUser;
  }
  
  // Create new user
  var userId = "usr_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  var newUserRow = [userId, nickname, new Date()];
  userSheet.appendRow(newUserRow);
  
  // Create initial quest logs
  var questSheet = ss.getSheetByName("Quests");
  var questTypes = ["READ_3", "LIKE_5", "COMMENT_2", "FIND_GREAT", "FIND_POOR"];
  questTypes.forEach(function(qType) {
    var questId = "qst_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    questSheet.appendRow([questId, userId, qType, "IN_PROGRESS", 0, ""]);
  });
  
  // Give 10 initial XP for joining
  addXpTransaction(userId, 10, "Welcome Bonus");
  
  return {
    userId: userId,
    nickname: nickname,
    joinedDate: newUserRow[2]
  };
}

// Helper: Add XP transaction
function addXpTransaction(userId, amount, reason) {
  var ss = getSpreadsheet();
  var xpSheet = ss.getSheetByName("XP");
  var xpId = "xp_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  xpSheet.appendRow([xpId, userId, amount, reason, new Date()]);
}

// Calculate User total XP and Level
function getUserXpAndLevel(userId) {
  var xpData = getSheetDataAsJson("XP");
  var totalXp = xpData.reduce(function(sum, item) {
    if (item.userId === userId) {
      return sum + Number(item.xpChange || 0);
    }
    return sum;
  }, 0);
  
  // Formula: Level = floor(sqrt(XP / 100)) + 1
  var level = Math.floor(Math.sqrt(totalXp / 100)) + 1;
  return {
    xp: totalXp,
    level: level
  };
}

// Add a post (creating a block in the 2D world)
function addPost(userId, category, author, title, summary, paragraph, imageUrl) {
  var ss = getSpreadsheet();
  var postSheet = ss.getSheetByName("Posts");
  var posts = getSheetDataAsJson("Posts");
  
  // Define town borders
  var isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor", 
                 "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(category) !== -1;
  
  var minX = isGreat ? 50 : 550;
  var maxX = isGreat ? 450 : 950;
  
  // Determine coordinate x based on grid spacing of 60 to prevent overlapping
  var x = minX;
  var spacing = 60;
  var occupied = true;
  
  while (occupied) {
    occupied = posts.some(function(p) {
      return isGreat === (p.x < 500) && Math.abs(p.x - x) < 40;
    });
    if (occupied) {
      x += spacing;
      if (x > maxX) {
        // Wrap around with slight random offset to stack blocks higher
        x = minX + Math.floor(Math.random() * 40);
        spacing = 40 + Math.floor(Math.random() * 30);
      }
    }
  }
  
  var y = 0; // standard ground level block position
  var postId = "post_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  var newPostRow = [
    postId, 
    category, 
    author, 
    title, 
    summary, 
    paragraph, 
    imageUrl || "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=150&auto=format&fit=crop", 
    x, 
    y, 
    new Date()
  ];
  
  postSheet.appendRow(newPostRow);
  
  // User gets +5 XP for submitting a block
  addXpTransaction(userId, 5, "Submitted Post");
  
  return getGameData(userId);
}

// Fetch all game state for a user (posts, user status, today's recommendation, quests, badges)
function getGameData(userId) {
  var posts = getSheetDataAsJson("Posts");
  var views = getSheetDataAsJson("Views");
  var likes = getSheetDataAsJson("Likes");
  var comments = getSheetDataAsJson("Comments");
  var badges = getSheetDataAsJson("Badges");
  var quests = getSheetDataAsJson("Quests");
  var settings = getSheetDataAsJson("Settings");
  
  // Calculate level & xp
  var stats = getUserXpAndLevel(userId);
  
  // Filter user's badges
  var userBadges = badges.filter(function(b) { return b.userId === userId; }).map(function(b) { return b.badgeType; });
  
  // Filter user's quests
  var userQuests = quests.filter(function(q) { return q.userId === userId; });
  
  // Append view/like/comment counts to each post
  var processedPosts = posts.map(function(p) {
    var pViews = views.filter(function(v) { return v.postId === p.postId; });
    var pLikes = likes.filter(function(l) { return l.postId === p.postId; });
    var pComments = comments.filter(function(c) { return c.postId === p.postId; });
    
    return {
      postId: p.postId,
      category: p.category,
      author: p.author,
      title: p.title,
      summary: p.summary,
      paragraph: p.paragraph,
      imageUrl: p.imageUrl,
      x: Number(p.x),
      y: Number(p.y),
      createdDate: p.createdDate,
      viewsCount: pViews.length,
      likesCount: pLikes.length,
      commentsCount: pComments.length,
      hasLiked: likes.some(function(l) { return l.postId === p.postId && l.userId === userId; })
    };
  });
  
  // Daily recommended person logic
  var recommendedPost = getDailyRecommendation(processedPosts);
  
  return {
    userId: userId,
    xp: stats.xp,
    level: stats.level,
    posts: processedPosts,
    badges: userBadges,
    quests: userQuests,
    recommendedPost: recommendedPost
  };
}

// Daily recommended person controller
function getDailyRecommendation(posts) {
  if (posts.length === 0) return null;
  
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Settings");
  var settings = getSheetDataAsJson("Settings");
  
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  var cachedPostId = "";
  var cachedDate = "";
  var postRowIndex = -1;
  var dateRowIndex = -1;
  
  var rows = settingsSheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === "recommended_post_id") {
      cachedPostId = rows[i][1];
      postRowIndex = i + 1;
    }
    if (rows[i][0] === "recommended_date") {
      cachedDate = rows[i][1];
      dateRowIndex = i + 1;
    }
  }
  
  var recommended = posts.find(function(p) { return p.postId === cachedPostId; });
  
  if (recommended && cachedDate === todayStr) {
    return recommended;
  }
  
  // Cache is missing or outdated, pick a new recommendation randomly
  var randPost = posts[Math.floor(Math.random() * posts.length)];
  
  if (postRowIndex !== -1) {
    settingsSheet.getRange(postRowIndex, 2).setValue(randPost.postId);
  } else {
    settingsSheet.appendRow(["recommended_post_id", randPost.postId]);
  }
  
  if (dateRowIndex !== -1) {
    settingsSheet.getRange(dateRowIndex, 2).setValue(todayStr);
  } else {
    settingsSheet.appendRow(["recommended_date", todayStr]);
  }
  
  return randPost;
}

// Record block reading
function readBlock(userId, postId) {
  var ss = getSpreadsheet();
  var viewSheet = ss.getSheetByName("Views");
  var views = getSheetDataAsJson("Views");
  var posts = getSheetDataAsJson("Posts");
  
  var post = posts.find(function(p) { return p.postId === postId; });
  if (!post) throw new Error("Post not found");
  
  var alreadyRead = views.some(function(v) { return v.postId === postId && v.userId === userId; });
  
  if (!alreadyRead) {
    var viewId = "vw_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    viewSheet.appendRow([viewId, postId, userId, new Date()]);
    
    // XP awarded only if viewing a friend's block (author is different)
    // We compare user nickname or just check if author != user nickname. But we don't store authorUserId in Posts.
    // Instead we check if user's nickname equals the author. Let's find user's nickname.
    var users = getSheetDataAsJson("Users");
    var user = users.find(function(u) { return u.userId === userId; });
    var nickname = user ? user.nickname : "";
    
    if (nickname.toLowerCase() !== post.author.toLowerCase()) {
      addXpTransaction(userId, 10, "Read Block: " + post.title);
      checkMilestoneBadges(userId);
      updateQuestProgress(userId, post);
    }
  }
  
  return getGameData(userId);
}

// Toggle or submit a Like
function toggleLike(userId, postId) {
  var ss = getSpreadsheet();
  var likeSheet = ss.getSheetByName("Likes");
  var likes = getSheetDataAsJson("Likes");
  var posts = getSheetDataAsJson("Posts");
  var users = getSheetDataAsJson("Users");
  
  var post = posts.find(function(p) { return p.postId === postId; });
  if (!post) throw new Error("Post not found");
  
  var existingLike = likes.find(function(l) { return l.postId === postId && l.userId === userId; });
  
  if (!existingLike) {
    // Like
    var likeId = "lk_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    likeSheet.appendRow([likeId, postId, userId, new Date()]);
    
    // +2 XP to the user who liked
    addXpTransaction(userId, 2, "Liked Block: " + post.title);
    
    // Find the author of the post to reward them +3 XP
    var authorUser = users.find(function(u) { return u.nickname.toLowerCase() === post.author.toLowerCase(); });
    if (authorUser && authorUser.userId !== userId) {
      addXpTransaction(authorUser.userId, 3, "Received Like on: " + post.title);
      checkMilestoneBadges(authorUser.userId); // Check popular author badge
    }
    
    // Update quest progress for Liker
    updateQuestProgress(userId, null, "LIKE");
    checkMilestoneBadges(userId);
  }
  
  return getGameData(userId);
}

// Submit a Comment
function addComment(userId, postId, authorNickname, commentText) {
  if (!commentText.trim()) throw new Error("Comment text cannot be empty");
  
  var ss = getSpreadsheet();
  var commentSheet = ss.getSheetByName("Comments");
  
  var commentId = "cmt_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  commentSheet.appendRow([commentId, postId, authorNickname, commentText, new Date()]);
  
  // +5 XP to commentator
  addXpTransaction(userId, 5, "Added Comment");
  
  // Update quests & milestone badges
  updateQuestProgress(userId, null, "COMMENT");
  checkMilestoneBadges(userId);
  
  return getGameData(userId);
}

// Quest progression helper
function updateQuestProgress(userId, post, actionType) {
  var ss = getSpreadsheet();
  var questSheet = ss.getSheetByName("Quests");
  var questRows = questSheet.getDataRange().getValues();
  
  var views = getSheetDataAsJson("Views").filter(function(v) { return v.userId === userId; });
  var likes = getSheetDataAsJson("Likes").filter(function(l) { return l.userId === userId; });
  var comments = getSheetDataAsJson("Comments"); // Need to match comments written by this user
  
  // Find user nickname
  var users = getSheetDataAsJson("Users");
  var userObj = users.find(function(u) { return u.userId === userId; });
  var userNickname = userObj ? userObj.nickname : "";
  
  var userComments = comments.filter(function(c) { return c.user.toLowerCase() === userNickname.toLowerCase(); });
  
  // Re-read posts to match categories
  var posts = getSheetDataAsJson("Posts");
  
  for (var i = 1; i < questRows.length; i++) {
    if (questRows[i][1] === userId && questRows[i][3] === "IN_PROGRESS") {
      var qType = questRows[i][2];
      var progress = 0;
      var target = 1;
      
      if (qType === "READ_3") {
        progress = views.length;
        target = 3;
      } else if (qType === "LIKE_5") {
        progress = likes.length;
        target = 5;
      } else if (qType === "COMMENT_2") {
        progress = userComments.length;
        target = 2;
      } else if (qType === "FIND_GREAT" && post) {
        var isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor",
                       "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(post.category) !== -1;
        if (isGreat) {
          progress = 1;
        } else {
          continue;
        }
      } else if (qType === "FIND_POOR" && post) {
        var isPoor = ["Migrant worker", "Elderly living alone", "Disabled", "School dropout youth", "Socially vulnerable",
                       "이주노동자", "독거노인", "장애인", "학교 밖 청소년", "사회적 약자"].indexOf(post.category) !== -1;
        if (isPoor) {
          progress = 1;
        } else {
          continue;
        }
      } else {
        continue;
      }
      
      // Update sheets
      questSheet.getRange(i + 1, 5).setValue(progress);
      if (progress >= target) {
        questSheet.getRange(i + 1, 4).setValue("COMPLETED");
        questSheet.getRange(i + 1, 6).setValue(new Date());
        
        // Award rewards
        var rewardXp = 0;
        var badgeType = "";
        
        if (qType === "READ_3") {
          rewardXp = 50;
          badgeType = "독서 입문자";
        } else if (qType === "LIKE_5") {
          rewardXp = 30;
          badgeType = "공감의 요정";
        } else if (qType === "COMMENT_2") {
          rewardXp = 40;
          badgeType = "친절한 이웃";
        } else if (qType === "FIND_GREAT") {
          rewardXp = 50;
          badgeType = "역사 탐험가";
        } else if (qType === "FIND_POOR") {
          rewardXp = 50;
          badgeType = "따뜻한 시선";
        }
        
        addXpTransaction(userId, rewardXp, "Quest Completed: " + qType);
        awardBadge(userId, badgeType);
      }
    }
  }
}

// Award Badge
function awardBadge(userId, badgeType) {
  var ss = getSpreadsheet();
  var badgeSheet = ss.getSheetByName("Badges");
  var badges = getSheetDataAsJson("Badges");
  
  var alreadyHas = badges.some(function(b) {
    return b.userId === userId && b.badgeType === badgeType;
  });
  
  if (!alreadyHas) {
    var badgeId = "bdg_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    badgeSheet.appendRow([badgeId, userId, badgeType, new Date()]);
  }
}

// Check and award Milestone Badges
function checkMilestoneBadges(userId) {
  var views = getSheetDataAsJson("Views").filter(function(v) { return v.userId === userId; });
  var comments = getSheetDataAsJson("Comments");
  
  var users = getSheetDataAsJson("Users");
  var userObj = users.find(function(u) { return u.userId === userId; });
  var nickname = userObj ? userObj.nickname : "";
  
  var userComments = comments.filter(function(c) { return c.user.toLowerCase() === nickname.toLowerCase(); });
  
  // Check likes received
  var posts = getSheetDataAsJson("Posts").filter(function(p) { return p.author.toLowerCase() === nickname.toLowerCase(); });
  var likes = getSheetDataAsJson("Likes");
  var likesReceived = likes.filter(function(l) {
    return posts.some(function(p) { return p.postId === l.postId; });
  }).length;
  
  // 1. 독서가: 블록 10개 읽기
  if (views.length >= 10) {
    awardBadge(userId, "독서가");
  }
  // 2. 탐험가: 블록 30개 읽기
  if (views.length >= 30) {
    awardBadge(userId, "탐험가");
  }
  // 3. 마을 연구자: 블록 50개 읽기
  if (views.length >= 50) {
    awardBadge(userId, "마을 연구자");
  }
  // 4. 소통왕: 댓글 20개 작성
  if (userComments.length >= 20) {
    awardBadge(userId, "소통왕");
  }
  // 5. 인기 작가: 좋아요 30개 획득
  if (likesReceived >= 30) {
    awardBadge(userId, "인기 작가");
  }
}

// Compile stats for teacher page
function getAdminStats() {
  initDatabase();
  
  var users = getSheetDataAsJson("Users");
  var posts = getSheetDataAsJson("Posts");
  var views = getSheetDataAsJson("Views");
  var likes = getSheetDataAsJson("Likes");
  var comments = getSheetDataAsJson("Comments");
  var xp = getSheetDataAsJson("XP");
  
  // 1. Student Count
  var studentCount = users.length;
  
  // 2. Submission Rate
  var ss = getSpreadsheet();
  var settings = getSheetDataAsJson("Settings");
  var totalStudentsSetting = settings.find(function(s) { return s.key === "total_students"; });
  var targetCount = totalStudentsSetting ? Number(totalStudentsSetting.value) : 30;
  var submissionRate = targetCount > 0 ? Math.round((posts.length / targetCount) * 100) : 0;
  
  // 3. Totals
  var totalReads = views.length;
  var totalLikes = likes.length;
  var totalComments = comments.length;
  
  // 4. Popular People Top 10 (most viewed posts)
  var postViews = posts.map(function(p) {
    var count = views.filter(function(v) { return v.postId === p.postId; }).length;
    return {
      title: p.title,
      author: p.author,
      views: count
    };
  });
  postViews.sort(function(a, b) { return b.views - a.views; });
  var popularPeopleTop10 = postViews.slice(0, 10);
  
  // 5. Word Cloud & Keyword Frequency Top 20
  var combinedText = "";
  posts.forEach(function(p) {
    combinedText += " " + p.title + " " + p.summary + " " + p.paragraph;
  });
  var words = extractKeywords(combinedText);
  var wordCloudData = words.slice(0, 100);
  var popularKeywordsTop20 = words.slice(0, 20);
  
  // 6. Heatmap Data
  var heatmapData = posts.map(function(p) {
    var count = views.filter(function(v) { return v.postId === p.postId; }).length;
    return {
      postId: p.postId,
      title: p.title,
      author: p.author,
      x: Number(p.x),
      y: Number(p.y),
      category: p.category,
      views: count
    };
  });
  
  // 7. Rankings: Weekly XP, Monthly XP, Likes, Views
  var rankings = getRankings(users, posts, views, likes, xp);
  
  return {
    studentCount: studentCount,
    submissionRate: submissionRate,
    totalReads: totalReads,
    totalLikes: totalLikes,
    totalComments: totalComments,
    popularPeopleTop10: popularPeopleTop10,
    popularKeywordsTop20: popularKeywordsTop20,
    wordCloudData: wordCloudData,
    heatmapData: heatmapData,
    rankings: rankings
  };
}

// Korean Noun and Stopwords Parser for Keyword Extraction
function extractKeywords(text) {
  if (!text) return [];
  
  // Clean text from punctuation
  var cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'\[\]]/g, " ").replace(/\s+/g, " ");
  var tokens = cleanText.split(" ");
  
  // List of standard Korean stop words (conjunctions, prepositions, endings, common words)
  var stopWords = [
    "은", "는", "이", "가", "을", "를", "에", "의", "로", "으로", "과", "와", "도", "에서", 
    "등", "한", "것", "들", "수", "해", "그", "이것", "저것", "그것", "있다", "없다", 
    "합니다", "입니다", "하고", "그리고", "하지만", "때문에", "대한", "대해", "위해", 
    "통해", "정말", "매우", "가장", "함께", "많은", "모든", "요약", "문단", "제목",
    "사람", "친구", "블록", "마을", "학생", "작성자", "인물", "우리가", "우리", "그는", "그녀는"
  ];
  
  var freq = {};
  tokens.forEach(function(token) {
    token = token.trim();
    if (token.length < 2) return; // Skip single characters
    
    // Simple stemming/cleaning of endings
    var stem = token;
    var suffixes = ["은", "는", "이", "가", "을", "를", "에", "의", "로", "으로", "과", "와", "도", "에서", "들", "을"];
    suffixes.forEach(function(sfx) {
      if (stem.endsWith(sfx) && stem.length > sfx.length) {
        stem = stem.substring(0, stem.length - sfx.length);
      }
    });
    
    if (stopWords.indexOf(stem) === -1 && stem.length >= 2) {
      freq[stem] = (freq[stem] || 0) + 1;
    }
  });
  
  var sorted = [];
  for (var key in freq) {
    sorted.push({ text: key, size: freq[key] });
  }
  sorted.sort(function(a, b) { return b.size - a.size; });
  return sorted;
}

// Compile rankings lists (Top 10)
function getRankings(users, posts, views, likes, xp) {
  var now = new Date().getTime();
  var oneWeek = 7 * 24 * 60 * 60 * 1000;
  var oneMonth = 30 * 24 * 60 * 60 * 1000;
  
  // Pre-calculate user names and totals
  var userList = users.map(function(u) {
    var uXp = xp.filter(function(x) { return x.userId === u.userId; });
    
    var weeklyXp = uXp.reduce(function(sum, x) {
      var date = new Date(x.timestamp).getTime();
      return (now - date < oneWeek) ? sum + Number(x.xpChange || 0) : sum;
    }, 0);
    
    var monthlyXp = uXp.reduce(function(sum, x) {
      var date = new Date(x.timestamp).getTime();
      return (now - date < oneMonth) ? sum + Number(x.xpChange || 0) : sum;
    }, 0);
    
    var totalXp = uXp.reduce(function(sum, x) {
      return sum + Number(x.xpChange || 0);
    }, 0);
    
    // Likes received
    var userPosts = posts.filter(function(p) { return p.author.toLowerCase() === u.nickname.toLowerCase(); });
    var likesCount = likes.filter(function(l) {
      return userPosts.some(function(p) { return p.postId === l.postId; });
    }).length;
    
    // Views received
    var viewsCount = views.filter(function(v) {
      return userPosts.some(function(p) { return p.postId === v.postId; });
    }).length;
    
    return {
      nickname: u.nickname,
      weeklyXp: weeklyXp,
      monthlyXp: monthlyXp,
      likes: likesCount,
      views: viewsCount,
      totalXp: totalXp
    };
  });
  
  // Weekly XP Ranking
  var weeklyRank = JSON.parse(JSON.stringify(userList));
  weeklyRank.sort(function(a, b) { return b.weeklyXp - a.weeklyXp; });
  
  // Monthly XP Ranking
  var monthlyRank = JSON.parse(JSON.stringify(userList));
  monthlyRank.sort(function(a, b) { return b.monthlyXp - a.monthlyXp; });
  
  // Likes Ranking
  var likesRank = JSON.parse(JSON.stringify(userList));
  likesRank.sort(function(a, b) { return b.likes - a.likes; });
  
  // Views Ranking
  var viewsRank = JSON.parse(JSON.stringify(userList));
  viewsRank.sort(function(a, b) { return b.views - a.views; });
  
  return {
    weeklyXp: weeklyRank.slice(0, 10),
    monthlyXp: monthlyRank.slice(0, 10),
    likes: likesRank.slice(0, 10),
    views: viewsRank.slice(0, 10)
  };
}

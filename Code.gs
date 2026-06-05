/**
 * Minecraft style Educational Game - Backend Headless JSON API (Code.gs)
 * Decoupled API endpoint with automatic CORS support via ContentService.
 * Expanded to support Gold and Pickaxe purchase transactions.
 */

// Headless API Routing
function doGet(e) {
  var action = e.parameter.action;
  var result;
  
  try {
    if (!action) {
      throw new Error("Missing action parameter");
    }
    
    if (action === 'initDatabase') {
      result = { url: initDatabase() };
    } 
    else if (action === 'registerOrLoginUser') {
      result = registerOrLoginUser(e.parameter.nickname);
    } 
    else if (action === 'getGameData') {
      result = getGameData(e.parameter.userId);
    } 
    else if (action === 'addPost') {
      result = addPost(
        e.parameter.userId,
        e.parameter.category,
        e.parameter.author,
        e.parameter.title,
        e.parameter.summary,
        e.parameter.paragraph,
        e.parameter.imageUrl
      );
    } 
    else if (action === 'readBlock') {
      result = readBlock(e.parameter.userId, e.parameter.postId, Number(e.parameter.bonusGold || 0));
    } 
    else if (action === 'toggleLike') {
      result = toggleLike(e.parameter.userId, e.parameter.postId);
    } 
    else if (action === 'addComment') {
      result = addComment(
        e.parameter.userId,
        e.parameter.postId,
        e.parameter.authorNickname,
        e.parameter.commentText
      );
    } 
    else if (action === 'getSheetData') {
      result = getSheetDataAsJson(e.parameter.sheetName);
    } 
    else if (action === 'getAdminStats') {
      result = getAdminStats();
    }
    else if (action === 'updateSetting') {
      result = updateSetting(e.parameter.key, e.parameter.value);
    }
    else if (action === 'buyPickaxe') {
      result = buyPickaxe(e.parameter.userId, e.parameter.pickaxeTier, Number(e.parameter.cost));
    }
    else if (action === 'mineBonusOre') {
      result = mineBonusOre(e.parameter.userId, e.parameter.oreId, Number(e.parameter.bonusGold || 0));
    } 
    else {
      throw new Error("Invalid action: " + action);
    }
    
    // Return output with automatic CORS headers added by Google Apps Script
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// Update settings values
function updateSetting(key, value) {
  initDatabase();
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Settings");
  var rows = settingsSheet.getDataRange().getValues();
  var foundRowIndex = -1;
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      foundRowIndex = i + 1;
      break;
    }
  }
  
  if (foundRowIndex !== -1) {
    settingsSheet.getRange(foundRowIndex, 2).setValue(value);
  } else {
    settingsSheet.appendRow([key, value]);
  }
  
  return { success: true };
}

// Get or auto-generate Spreadsheet database
function getSpreadsheet() {
  var properties = PropertiesService.getScriptProperties();
  var sheetId = properties.getProperty('SPREADSHEET_ID');
  
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (err) {
      Logger.log("Stored spreadsheet ID invalid. Re-creating: " + err.message);
    }
  }
  
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      properties.setProperty('SPREADSHEET_ID', active.getId());
      return active;
    }
  } catch (err) {
    Logger.log("Container-bound active spreadsheet not found.");
  }
  
  var newSpreadsheet = SpreadsheetApp.create('Minecraft_Edu_Game_Database');
  properties.setProperty('SPREADSHEET_ID', newSpreadsheet.getId());
  return newSpreadsheet;
}

// Auto-initialize sheets and headers
function initDatabase() {
  var ss = getSpreadsheet();
  
  var sheetsConfig = {
    "Users": ["userId", "nickname", "joinedDate", "gold"],
    "Posts": ["postId", "category", "author", "title", "summary", "paragraph", "imageUrl", "x", "y", "createdDate"],
    "Views": ["viewId", "postId", "userId", "viewedDate"],
    "Likes": ["likeId", "postId", "userId", "likedDate"],
    "Comments": ["commentId", "postId", "user", "comment", "date"],
    "XP": ["xpId", "userId", "xpChange", "reason", "timestamp"],
    "Badges": ["badgeId", "userId", "badgeType", "date"],
    "Quests": ["questId", "userId", "questType", "status", "progress", "completedDate"],
    "Settings": ["key", "value"],
    "BonusOres": ["oreId", "name", "x", "y", "hp", "rewardGold", "rewardXp", "category"],
    "BonusMined": ["minedId", "oreId", "userId", "minedDate"]
  };
  
  for (var sheetName in sheetsConfig) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheetsConfig[sheetName]);
      
      var headerRange = sheet.getRange(1, 1, 1, sheetsConfig[sheetName].length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#374151");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  }
  
  // Database Migration: check if gold column exists in Users and correct any invalid data
  var userSheet = ss.getSheetByName("Users");
  if (userSheet) {
    var lastCol = userSheet.getLastColumn();
    var headers = [];
    if (lastCol > 0) {
      headers = userSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
    var goldColIndex = headers.indexOf("gold");
    
    if (goldColIndex === -1) {
      var colPos = 4;
      if (lastCol >= 4) {
        var col4Header = userSheet.getRange(1, 4).getValue();
        if (!col4Header || col4Header.toString().trim() === "") {
          colPos = 4;
        } else {
          colPos = lastCol + 1;
        }
      }
      userSheet.getRange(1, colPos).setValue("gold");
      userSheet.getRange(1, colPos).setFontWeight("bold");
      userSheet.getRange(1, colPos).setBackground("#374151");
      userSheet.getRange(1, colPos).setFontColor("#ffffff");
      
      var lastRow = userSheet.getLastRow();
      if (lastRow > 1) {
        var goldRange = userSheet.getRange(2, colPos, lastRow - 1, 1);
        var defaultGolds = [];
        for (var i = 2; i <= lastRow; i++) {
          defaultGolds.push([100]); // 100 default gold
        }
        goldRange.setValues(defaultGolds);
      }
    } else {
      // Clean up empty, invalid, "NaN" or "undefined" cells defensively
      var lastRow = userSheet.getLastRow();
      if (lastRow > 1) {
        var colPos = goldColIndex + 1;
        var goldRange = userSheet.getRange(2, colPos, lastRow - 1, 1);
        var vals = goldRange.getValues();
        var updated = false;
        for (var i = 0; i < vals.length; i++) {
          var val = vals[i][0];
          if (val === "" || val === null || val === undefined || isNaN(Number(val)) || val === "undefined" || val === "NaN") {
            vals[i][0] = 100;
            updated = true;
          }
        }
        if (updated) {
          goldRange.setValues(vals);
        }
      }
    }
  }
  
  // If BonusOres is newly created or empty, add default bonus ores
  var bonusOresSheet = ss.getSheetByName("BonusOres");
  if (bonusOresSheet && bonusOresSheet.getLastRow() <= 1) {
    var defaultBonusOres = [
      ["ore_1", "🪙 황금 광맥", "120", "20", "5", "200", "30", "Gold Vein"],
      ["ore_2", "💎 다이아몬드 광맥", "220", "-10", "10", "500", "100", "Diamond Ore"],
      ["ore_3", "🟢 에메랄드 원석", "350", "40", "6", "300", "50", "Emerald Ore"],
      ["ore_4", "🔥 화산 루비 결정", "650", "-20", "8", "400", "80", "Ruby Crystal"],
      ["ore_5", "⚡ 신비한 마법 광석", "850", "30", "12", "1000", "200", "Magic Ore"]
    ];
    for (var i = 0; i < defaultBonusOres.length; i++) {
      bonusOresSheet.appendRow(defaultBonusOres[i]);
    }
  }
  
  var settingsSheet = ss.getSheetByName("Settings");
  var data = settingsSheet.getDataRange().getValues();
  if (data.length <= 1) {
    settingsSheet.appendRow(["total_students", "30"]);
    settingsSheet.appendRow(["recommended_post_id", ""]);
    settingsSheet.appendRow(["recommended_date", ""]);
  }
  
  return ss.getUrl();
}

// Get Sheet as JSON array
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

// Get user gold balance
function getUserGold(userId) {
  var users = getSheetDataAsJson("Users");
  var user = users.find(function(u) { return u.userId === userId; });
  if (!user) return 0;
  var val = user.gold;
  if (val === undefined || val === null || val === "" || isNaN(Number(val)) || val === "undefined" || val === "NaN") {
    return 0;
  }
  return Number(val);
}

// Change user gold balance
function changeUserGold(userId, amount) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Users");
  var range = sheet.getDataRange();
  var values = range.getValues();
  var foundRowIndex = -1;
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === userId) {
      foundRowIndex = i + 1;
      break;
    }
  }
  
  if (foundRowIndex !== -1) {
    var rawVal = values[foundRowIndex - 1][3];
    var currentGold = 0;
    if (rawVal !== undefined && rawVal !== null && rawVal !== "" && !isNaN(Number(rawVal)) && rawVal !== "undefined" && rawVal !== "NaN") {
      currentGold = Number(rawVal);
    }
    sheet.getRange(foundRowIndex, 4).setValue(currentGold + amount);
  }
}

// Buy pickaxe
function buyPickaxe(userId, pickaxeTier, cost) {
  var currentGold = getUserGold(userId);
  if (currentGold < cost) throw new Error("Gold가 부족합니다!");
  
  changeUserGold(userId, -cost);
  awardBadge(userId, "pickaxe_" + pickaxeTier);
  return getGameData(userId);
}

// User Registration / Login
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
  
  var userId = "usr_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  var newUserRow = [userId, nickname, new Date(), 100]; // Start with 100 gold
  userSheet.appendRow(newUserRow);
  
  var questSheet = ss.getSheetByName("Quests");
  var questTypes = ["READ_3", "LIKE_5", "COMMENT_2", "FIND_GREAT", "FIND_POOR"];
  questTypes.forEach(function(qType) {
    var questId = "qst_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    questSheet.appendRow([questId, userId, qType, "IN_PROGRESS", 0, ""]);
  });
  
  addXpTransaction(userId, 10, "Welcome Bonus");
  
  return {
    userId: userId,
    nickname: nickname,
    joinedDate: newUserRow[2],
    gold: 100
  };
}

// XP transaction logger
function addXpTransaction(userId, amount, reason) {
  var ss = getSpreadsheet();
  var xpSheet = ss.getSheetByName("XP");
  var xpId = "xp_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  xpSheet.appendRow([xpId, userId, amount, reason, new Date()]);
}

// Aggregated XP calculator
function getUserXpAndLevel(userId) {
  var xpData = getSheetDataAsJson("XP");
  var totalXp = xpData.reduce(function(sum, item) {
    if (item.userId === userId) {
      return sum + Number(item.xpChange || 0);
    }
    return sum;
  }, 0);
  
  var level = Math.floor(Math.sqrt(totalXp / 100)) + 1;
  return {
    xp: totalXp,
    level: level
  };
}

// Spawns/inserts blocks into double towns
function addPost(userId, category, author, title, summary, paragraph, imageUrl) {
  var ss = getSpreadsheet();
  var postSheet = ss.getSheetByName("Posts");
  var posts = getSheetDataAsJson("Posts");
  
  var isGreat = ["Hero", "Volunteer", "Independence fighter", "Educator", "Community contributor", 
                 "영웅", "봉사자", "독립운동가", "교육자", "지역사회 공헌 인물"].indexOf(category) !== -1;
  
  var minX = isGreat ? 50 : 550;
  var maxX = isGreat ? 450 : 950;
  
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
        x = minX + Math.floor(Math.random() * 40);
        spacing = 40 + Math.floor(Math.random() * 30);
      }
    }
  }
  
  var y = Math.floor(Math.random() * 80) - 40; // Assign random Y depth on cavern floor!
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
  addXpTransaction(userId, 5, "Submitted Post");
  changeUserGold(userId, 50); // Reward 50 Gold for creating block
  
  return getGameData(userId);
}

// Build game states payload
function getGameData(userId) {
  var posts = getSheetDataAsJson("Posts");
  var views = getSheetDataAsJson("Views");
  var likes = getSheetDataAsJson("Likes");
  var comments = getSheetDataAsJson("Comments");
  var badges = getSheetDataAsJson("Badges");
  var quests = getSheetDataAsJson("Quests");
  var bonusOres = getSheetDataAsJson("BonusOres");
  var bonusMined = getSheetDataAsJson("BonusMined");
  
  var stats = getUserXpAndLevel(userId);
  var userBadges = badges.filter(function(b) { return b.userId === userId; }).map(function(b) { return b.badgeType; });
  var userQuests = quests.filter(function(q) { return q.userId === userId; });
  
  var processedPosts = posts.map(function(p) {
    var pViews = views.filter(function(v) { return v.postId === p.postId; });
    var pLikes = likes.filter(function(l) { return l.postId === p.postId; });
    
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
      hasLiked: likes.some(function(l) { return l.postId === p.postId && l.userId === userId; })
    };
  });
  
  var processedBonusOres = bonusOres.map(function(ore) {
    var hasMined = bonusMined.some(function(m) {
      return m.oreId === ore.oreId && m.userId === userId;
    });
    return {
      oreId: ore.oreId,
      name: ore.name,
      x: Number(ore.x),
      y: Number(ore.y),
      hp: Number(ore.hp),
      rewardGold: Number(ore.rewardGold),
      rewardXp: Number(ore.rewardXp),
      category: ore.category,
      hasMined: hasMined
    };
  });
  
  var recommendedPost = getDailyRecommendation(processedPosts);
  
  return {
    userId: userId,
    xp: stats.xp,
    level: stats.level,
    gold: getUserGold(userId),
    posts: processedPosts,
    bonusOres: processedBonusOres,
    badges: userBadges,
    quests: userQuests,
    recommendedPost: recommendedPost
  };
}

function getDailyRecommendation(posts) {
  if (posts.length === 0) return null;
  
  var ss = getSpreadsheet();
  var settingsSheet = ss.getSheetByName("Settings");
  
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

// Log block reading views
function readBlock(userId, postId, clientBonusGold) {
  var ss = getSpreadsheet();
  var viewSheet = ss.getSheetByName("Views");
  var views = getSheetDataAsJson("Views");
  var posts = getSheetDataAsJson("Posts");
  
  var post = posts.find(function(p) { return p.postId === postId; });
  
  if (postId === "post_dummy_quest_trigger") {
    checkMilestoneBadges(userId);
    updateQuestProgress(userId, null);
    return getGameData(userId);
  }
  
  if (!post) throw new Error("Post not found");
  
  var alreadyRead = views.some(function(v) { return v.postId === postId && v.userId === userId; });
  
  if (!alreadyRead) {
    var viewId = "vw_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    viewSheet.appendRow([viewId, postId, userId, new Date()]);
    
    var users = getSheetDataAsJson("Users");
    var user = users.find(function(u) { return u.userId === userId; });
    var nickname = user ? user.nickname : "";
    
    if (nickname.toLowerCase() !== post.author.toLowerCase()) {
      addXpTransaction(userId, 10, "Read Block: " + post.title);
      
      var randMiningBonus = Math.floor(Math.random() * 51) + 30; // Random 30 ~ 80 gold
      var totalReward = 15 + Number(clientBonusGold || 0) + randMiningBonus;
      
      changeUserGold(userId, totalReward);
      checkMilestoneBadges(userId);
      updateQuestProgress(userId, post);
    }
  } else {
    if (Number(clientBonusGold || 0) > 0) {
      changeUserGold(userId, Number(clientBonusGold));
    }
  }
  
  return getGameData(userId);
}

// Toggle Like
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
    var likeId = "lk_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
    likeSheet.appendRow([likeId, postId, userId, new Date()]);
    
    addXpTransaction(userId, 2, "Liked Block: " + post.title);
    changeUserGold(userId, 5); // Liker gets 5 Gold
    
    var authorUser = users.find(function(u) { return u.nickname.toLowerCase() === post.author.toLowerCase(); });
    if (authorUser && authorUser.userId !== userId) {
      addXpTransaction(authorUser.userId, 3, "Received Like on: " + post.title);
      changeUserGold(authorUser.userId, 10); // Author gets 10 Gold
      checkMilestoneBadges(authorUser.userId);
    }
    
    updateQuestProgress(userId, null, "LIKE");
    checkMilestoneBadges(userId);
  }
  
  return getGameData(userId);
}

// Add Comments
function addComment(userId, postId, authorNickname, commentText) {
  if (!commentText.trim()) throw new Error("Comment text cannot be empty");
  
  var ss = getSpreadsheet();
  var commentSheet = ss.getSheetByName("Comments");
  
  var commentId = "cmt_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  commentSheet.appendRow([commentId, postId, authorNickname, commentText, new Date()]);
  
  addXpTransaction(userId, 5, "Added Comment");
  changeUserGold(userId, 20); // Reward 20 Gold for commenting
  
  updateQuestProgress(userId, null, "COMMENT");
  checkMilestoneBadges(userId);
  
  return getGameData(userId);
}

// Quest progression validation
function updateQuestProgress(userId, post, actionType) {
  var ss = getSpreadsheet();
  var questSheet = ss.getSheetByName("Quests");
  var questRows = questSheet.getDataRange().getValues();
  
  var views = getSheetDataAsJson("Views").filter(function(v) { return v.userId === userId; });
  var likes = getSheetDataAsJson("Likes").filter(function(l) { return l.userId === userId; });
  var comments = getSheetDataAsJson("Comments");
  
  var users = getSheetDataAsJson("Users");
  var userObj = users.find(function(u) { return u.userId === userId; });
  var userNickname = userObj ? userObj.nickname : "";
  
  var userComments = comments.filter(function(c) { return c.user.toLowerCase() === userNickname.toLowerCase(); });
  
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
        if (isGreat) progress = 1;
        else continue;
      } else if (qType === "FIND_POOR" && post) {
        var isPoor = ["Migrant worker", "Elderly living alone", "Disabled", "School dropout youth", "Socially vulnerable",
                       "이주노동자", "독거노인", "장애인", "학교 밖 청소년", "사회적 약자"].indexOf(post.category) !== -1;
        if (isPoor) progress = 1;
        else continue;
      } else {
        continue;
      }
      
      questSheet.getRange(i + 1, 5).setValue(progress);
      if (progress >= target) {
        questSheet.getRange(i + 1, 4).setValue("COMPLETED");
        questSheet.getRange(i + 1, 6).setValue(new Date());
        
        var rewardXp = 0;
        var badgeType = "";
        var rewardGold = 0;
        
        if (qType === "READ_3") {
          rewardXp = 50;
          rewardGold = 100;
          badgeType = "독서 입문자";
        } else if (qType === "LIKE_5") {
          rewardXp = 30;
          rewardGold = 80;
          badgeType = "공감의 요정";
        } else if (qType === "COMMENT_2") {
          rewardXp = 40;
          rewardGold = 100;
          badgeType = "친절한 이웃";
        } else if (qType === "FIND_GREAT") {
          rewardXp = 50;
          rewardGold = 100;
          badgeType = "역사 탐험가";
        } else if (qType === "FIND_POOR") {
          rewardXp = 50;
          rewardGold = 100;
          badgeType = "따뜻한 시선";
        }
        
        addXpTransaction(userId, rewardXp, "Quest Completed: " + qType);
        changeUserGold(userId, rewardGold); // Quest completion gold reward
        awardBadge(userId, badgeType);
      }
    }
  }
}

// Award badges
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

// Milestone checks
function checkMilestoneBadges(userId) {
  var views = getSheetDataAsJson("Views").filter(function(v) { return v.userId === userId; });
  var comments = getSheetDataAsJson("Comments");
  var users = getSheetDataAsJson("Users");
  var userObj = users.find(function(u) { return u.userId === userId; });
  var nickname = userObj ? userObj.nickname : "";
  
  var userComments = comments.filter(function(c) { return c.user.toLowerCase() === nickname.toLowerCase(); });
  
  var posts = getSheetDataAsJson("Posts").filter(function(p) { return p.author.toLowerCase() === nickname.toLowerCase(); });
  var likes = getSheetDataAsJson("Likes");
  var likesReceived = likes.filter(function(l) {
    return posts.some(function(p) { return p.postId === l.postId; });
  }).length;
  
  if (views.length >= 10) awardBadge(userId, "독서가");
  if (views.length >= 30) awardBadge(userId, "탐험가");
  if (views.length >= 50) awardBadge(userId, "마을 연구자");
  if (userComments.length >= 20) awardBadge(userId, "소통왕");
  if (likesReceived >= 30) awardBadge(userId, "인기 작가");
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
  
  var studentCount = users.length;
  
  var ss = getSpreadsheet();
  var settings = getSheetDataAsJson("Settings");
  var totalStudentsSetting = settings.find(function(s) { return s.key === "total_students"; });
  var targetCount = totalStudentsSetting ? Number(totalStudentsSetting.value) : 30;
  var submissionRate = targetCount > 0 ? Math.round((posts.length / targetCount) * 100) : 0;
  
  var totalReads = views.length;
  var totalLikes = likes.length;
  var totalComments = comments.length;
  
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
  
  var combinedText = "";
  posts.forEach(function(p) {
    combinedText += " " + p.title + " " + p.summary + " " + p.paragraph;
  });
  var words = extractKeywords(combinedText);
  var wordCloudData = words.slice(0, 100);
  var popularKeywordsTop20 = words.slice(0, 20);
  
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

// Korean Noun and Stopwords Parser
function extractKeywords(text) {
  if (!text) return [];
  
  var cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'\[\]]/g, " ").replace(/\s+/g, " ");
  var tokens = cleanText.split(" ");
  
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
    if (token.length < 2) return;
    
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

// Compile rankings lists
function getRankings(users, posts, views, likes, xp) {
  var now = new Date().getTime();
  var oneWeek = 7 * 24 * 60 * 60 * 1000;
  var oneMonth = 30 * 24 * 60 * 60 * 1000;
  
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
    
    var userPosts = posts.filter(function(p) { return p.author.toLowerCase() === u.nickname.toLowerCase(); });
    var likesCount = likes.filter(function(l) {
      return userPosts.some(function(p) { return p.postId === l.postId; });
    }).length;
    
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
  
  var weeklyRank = JSON.parse(JSON.stringify(userList));
  weeklyRank.sort(function(a, b) { return b.weeklyXp - a.weeklyXp; });
  
  var monthlyRank = JSON.parse(JSON.stringify(userList));
  monthlyRank.sort(function(a, b) { return b.monthlyXp - a.monthlyXp; });
  
  var likesRank = JSON.parse(JSON.stringify(userList));
  likesRank.sort(function(a, b) { return b.likes - a.likes; });
  
  var viewsRank = JSON.parse(JSON.stringify(userList));
  viewsRank.sort(function(a, b) { return b.views - a.views; });
  
  return {
    weeklyXp: weeklyRank.slice(0, 10),
    monthlyXp: monthlyRank.slice(0, 10),
    likes: likesRank.slice(0, 10),
    views: viewsRank.slice(0, 10)
  };
}

// Mine Bonus Ore
function mineBonusOre(userId, oreId, clientBonusGold) {
  var ss = getSpreadsheet();
  var bonusMinedSheet = ss.getSheetByName("BonusMined");
  var bonusMined = getSheetDataAsJson("BonusMined");
  
  var alreadyMined = bonusMined.some(function(m) {
    return m.oreId === oreId && m.userId === userId;
  });
  
  if (alreadyMined) throw new Error("Already mined");
  
  var ores = getSheetDataAsJson("BonusOres");
  var ore = ores.find(function(o) { return o.oreId === oreId; });
  if (!ore) throw new Error("Ore not found");
  
  var minedId = "mnd_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  bonusMinedSheet.appendRow([minedId, oreId, userId, new Date()]);
  
  var baseReward = Number(ore.rewardGold || 0);
  var randMiningBonus = Math.floor(Math.random() * 101) + 50; // Random 50 ~ 150 gold
  var totalReward = baseReward + Number(clientBonusGold || 0) + randMiningBonus;
  
  changeUserGold(userId, totalReward);
  addXpTransaction(userId, Number(ore.rewardXp || 0), "Mined Ore: " + ore.name);
  
  return getGameData(userId);
}

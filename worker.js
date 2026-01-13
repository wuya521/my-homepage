// Cloudflare Worker - 后端 API 服务
// 用于处理所有数据存储和管理操作

// CORS 响应头配置
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};

// 默认管理员账户
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123' // 首次登录后请立即修改
};

// 数据存储键名
const STORAGE_KEYS = {
  ADMIN: 'admin_account',
  PROFILE: 'user_profile',
  ANNOUNCEMENT: 'announcement',
  PORTALS: 'portals',
  ADVERTISEMENTS: 'advertisements',
  POPUP_AD: 'popup_ad',
  REDEEM_CODES: 'redeem_codes',
  VIP_USERS: 'vip_users',
  VERIFIED_USERS: 'verified_users',
  ONLINE_COUNT_CONFIG: 'online_count_config',
  ONLINE_USERS: 'online_users',
  BADGES: 'badges',
  USER_BADGES: 'user_badges',
  USER_LEVELS: 'user_levels',
  LEVEL_CONFIG: 'level_config',
  TIMELINE_EVENTS: 'timeline_events'
};

// 初始化默认数据
async function initializeDefaultData(KV) {
  try {
    // 检查是否已初始化
    const existingAdmin = await KV.get(STORAGE_KEYS.ADMIN);
    if (existingAdmin) {
      return; // 已经初始化过
    }

    // 初始化管理员账户
    await KV.put(STORAGE_KEYS.ADMIN, JSON.stringify(DEFAULT_ADMIN));

    // 初始化个人资料
    const defaultProfile = {
      name: '你的名字',
      avatar: 'https://via.placeholder.com/150',
      bio: '这是一段个人简介，介绍你自己吧！',
      email: 'your-email@example.com',
      github: '',
      twitter: '',
      website: ''
    };
    await KV.put(STORAGE_KEYS.PROFILE, JSON.stringify(defaultProfile));

    // 初始化公告
    const defaultAnnouncement = {
      title: '欢迎访问我的个人主页！',
      content: '这是一条公告内容，你可以在后台管理中修改。',
      enabled: true,
      updatedAt: new Date().toISOString()
    };
    await KV.put(STORAGE_KEYS.ANNOUNCEMENT, JSON.stringify(defaultAnnouncement));

    // 初始化门户链接
    const defaultPortals = [
      {
        id: '1',
        name: 'GitHub',
        url: 'https://github.com',
        icon: '🔗',
        description: '我的 GitHub 主页',
        enabled: true,
        pinned: false
      },
      {
        id: '2',
        name: '博客',
        url: 'https://example.com',
        icon: '📝',
        description: '个人技术博客',
        enabled: true,
        pinned: false
      }
    ];
    await KV.put(STORAGE_KEYS.PORTALS, JSON.stringify(defaultPortals));

    // 初始化广告位列表
    await KV.put(STORAGE_KEYS.ADVERTISEMENTS, JSON.stringify([]));

    // 初始化弹窗广告
    const defaultPopupAd = {
      id: 'default',
      enabled: false,
      content: '',
      frequency: 'daily', // 'daily' 或 'manual'
      createdAt: new Date().toISOString()
    };
    await KV.put(STORAGE_KEYS.POPUP_AD, JSON.stringify(defaultPopupAd));

    // 初始化兑换码列表
    await KV.put(STORAGE_KEYS.REDEEM_CODES, JSON.stringify([]));

    // 初始化 VIP 用户列表
    await KV.put(STORAGE_KEYS.VIP_USERS, JSON.stringify([]));

    // 初始化认证用户列表
    await KV.put(STORAGE_KEYS.VERIFIED_USERS, JSON.stringify([]));

    // 初始化在线人数配置
    const defaultOnlineConfig = {
      realCountEnabled: false,
      fakeCountEnabled: false,
      fakeCountMin: 100,
      fakeCountMax: 500,
      fakeCountBase: 200
    };
    await KV.put(STORAGE_KEYS.ONLINE_COUNT_CONFIG, JSON.stringify(defaultOnlineConfig));

    // 初始化在线用户列表
    await KV.put(STORAGE_KEYS.ONLINE_USERS, JSON.stringify([]));

    // 初始化勋章定义
    const defaultBadges = {
      'emperor': { name: '皇上', icon: '👑', color: '#FFD700', description: '至高无上的统治者' },
      'empress': { name: '皇后', icon: '👸', color: '#FF69B4', description: '母仪天下的皇后' },
      'treasurer': { name: '财政大臣', icon: '💰', color: '#32CD32', description: '掌管财政大权' },
      'ritual_master': { name: '礼部尚书', icon: '📜', color: '#9370DB', description: '掌管礼仪制度' },
      'hero': { name: '逆行者', icon: '🦸', color: '#FF4500', description: '勇敢的逆行者' },
      'skill_master': { name: '技能达人', icon: '🎯', color: '#00CED1', description: '技能超群的达人' },
      'emotion_master': { name: '情感大师', icon: '💝', color: '#FF1493', description: '情感专家' }
    };
    await KV.put(STORAGE_KEYS.BADGES, JSON.stringify(defaultBadges));

    // 初始化用户勋章
    await KV.put(STORAGE_KEYS.USER_BADGES, JSON.stringify([]));

    // 初始化用户等级
    await KV.put(STORAGE_KEYS.USER_LEVELS, JSON.stringify([]));

    // 初始化等级配置（新格式）
    const defaultLevelConfig = {
      checkinExp: 10, // 签到获得经验
      leveling_rule: {
        type: 'cumulative',
        note: 'required_xp 为到达该等级的累计经验门槛（>= 即达成）'
      },
      levels: [
        { level: 1, title: '庶民', required_xp: 0, color: '#8A8F98', badge: '🪶', privilege_points: 0 },
        { level: 2, title: '新丁', required_xp: 50, color: '#7C8AA3', badge: '🌱', privilege_points: 0 },
        { level: 3, title: '小吏', required_xp: 120, color: '#5D7A96', badge: '📜', privilege_points: 0 },
        { level: 4, title: '从九品', required_xp: 220, color: '#4F7D7A', badge: '🔰', privilege_points: 1 },
        { level: 5, title: '正九品', required_xp: 360, color: '#3F8062', badge: '🟩', privilege_points: 1 }
      ]
    };
    await KV.put(STORAGE_KEYS.LEVEL_CONFIG, JSON.stringify(defaultLevelConfig));

    // 初始化时间线事件
    await KV.put(STORAGE_KEYS.TIMELINE_EVENTS, JSON.stringify([]));

    console.log('默认数据初始化完成');
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
}

// 验证管理员身份
async function verifyAdmin(request, KV) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    const adminData = await KV.get(STORAGE_KEYS.ADMIN);
    if (!adminData) {
      return false;
    }

    const admin = JSON.parse(adminData);
    return username === admin.username && password === admin.password;
  } catch (error) {
    console.error('验证失败:', error);
    return false;
  }
}

// 生成随机兑换码
function generateRedeemCode(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i !== length - 1) {
      code += '-';
    }
  }
  return code;
}

// 响应构造函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

// 主请求处理函数
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 处理 OPTIONS 请求（CORS 预检）
  if (method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // 初始化默认数据
  await initializeDefaultData(env.MY_HOME_KV);

  // ==================== 公开 API（无需认证）====================

  // 获取个人资料
  if (path === '/api/profile' && method === 'GET') {
    const profile = await env.MY_HOME_KV.get(STORAGE_KEYS.PROFILE);
    return jsonResponse(profile ? JSON.parse(profile) : {});
  }

  // 获取公告
  if (path === '/api/announcement' && method === 'GET') {
    const announcement = await env.MY_HOME_KV.get(STORAGE_KEYS.ANNOUNCEMENT);
    return jsonResponse(announcement ? JSON.parse(announcement) : {});
  }

  // 获取门户链接
  if (path === '/api/portals' && method === 'GET') {
    const portals = await env.MY_HOME_KV.get(STORAGE_KEYS.PORTALS);
    const allPortals = portals ? JSON.parse(portals) : [];
    // 只返回启用的门户，并按置顶排序
    const enabledPortals = allPortals
      .filter(p => p.enabled)
      .sort((a, b) => {
        // 置顶的排在前面
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
    return jsonResponse(enabledPortals);
  }

  // 获取广告位列表
  if (path === '/api/advertisements' && method === 'GET') {
    const ads = await env.MY_HOME_KV.get(STORAGE_KEYS.ADVERTISEMENTS);
    const allAds = ads ? JSON.parse(ads) : [];
    // 只返回启用的广告，并按排序字段排序
    const enabledAds = allAds
      .filter(ad => ad.enabled)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    return jsonResponse(enabledAds);
  }

  // 检查兑换码信息（公开接口，用于前端显示可选内容）
  if (path === '/api/redeem/check' && method === 'GET') {
    const code = url.searchParams.get('code');
    
    if (!code) {
      return jsonResponse({ success: false, message: '请提供兑换码' }, 400);
    }

    const codesData = await env.MY_HOME_KV.get(STORAGE_KEYS.REDEEM_CODES);
    const codes = codesData ? JSON.parse(codesData) : [];
    
    const redeemCode = codes.find(c => c.code === code && !c.used);
    
    if (!redeemCode) {
      return jsonResponse({ success: false, message: '兑换码无效或已被使用' }, 400);
    }

    // 只返回公开信息，不返回敏感内容
    return jsonResponse({ 
      success: true,
      type: redeemCode.type,
      value: redeemCode.value,
      availableContents: redeemCode.availableContents || [],
      hasDocumentContent: !!redeemCode.documentContent
    });
  }

  // 使用兑换码
  if (path === '/api/redeem' && method === 'POST') {
    const { code, email, selectedContent } = await request.json();
    
    if (!code || !email) {
      return jsonResponse({ success: false, message: '请提供兑换码和邮箱' }, 400);
    }

    const codesData = await env.MY_HOME_KV.get(STORAGE_KEYS.REDEEM_CODES);
    const codes = codesData ? JSON.parse(codesData) : [];
    
    const codeIndex = codes.findIndex(c => c.code === code && !c.used);
    
    if (codeIndex === -1) {
      return jsonResponse({ success: false, message: '兑换码无效或已被使用' }, 400);
    }

    const redeemCode = codes[codeIndex];
    
    // 如果兑换码支持多种内容，使用用户选择的内容
    let contentToRedeem = selectedContent || redeemCode.value;
    
    // 根据类型自动发货
    if (redeemCode.type === 'vip') {
      // VIP类型：自动添加VIP用户
      const vipData = await env.MY_HOME_KV.get(STORAGE_KEYS.VIP_USERS);
      const vipUsers = vipData ? JSON.parse(vipData) : [];
      
      // 解析VIP等级和天数
      const vipLevel = contentToRedeem.match(/VIP[123]/)?.[0] || 'VIP1';
      const daysMatch = contentToRedeem.match(/(\d+)\s*天/);
      const days = daysMatch ? parseInt(daysMatch[1]) : 30;
      
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);
      
      const existingIndex = vipUsers.findIndex(u => u.email === email);
      const vipUser = {
        email,
        level: vipLevel,
        expiryDate: expiryDate.toISOString(),
        createdAt: new Date().toISOString()
      };
      
      if (existingIndex !== -1) {
        vipUsers[existingIndex] = vipUser;
      } else {
        vipUsers.push(vipUser);
      }
      
      await env.MY_HOME_KV.put(STORAGE_KEYS.VIP_USERS, JSON.stringify(vipUsers));
    } else if (redeemCode.type === 'verified') {
      // 认证类型：自动添加认证用户
      const verifiedData = await env.MY_HOME_KV.get(STORAGE_KEYS.VERIFIED_USERS);
      const verifiedUsers = verifiedData ? JSON.parse(verifiedData) : [];
      
      // 解析认证名称
      const verifiedName = contentToRedeem || '认证用户';
      
      if (!verifiedUsers.some(u => u.email === email)) {
        verifiedUsers.push({
          email,
          name: verifiedName,
          verifiedAt: new Date().toISOString()
        });
        
        await env.MY_HOME_KV.put(STORAGE_KEYS.VERIFIED_USERS, JSON.stringify(verifiedUsers));
      }
    } else if (redeemCode.type === 'document') {
      // 文档类型：返回文档内容（账号密码等）
      // 这里可以存储文档内容，实际使用时可以从数据库或文件系统获取
      contentToRedeem = redeemCode.documentContent || contentToRedeem;
    }

    // 标记为已使用
    codes[codeIndex].used = true;
    codes[codeIndex].usedBy = email;
    codes[codeIndex].usedAt = new Date().toISOString();
    codes[codeIndex].redeemedContent = contentToRedeem;
    
    await env.MY_HOME_KV.put(STORAGE_KEYS.REDEEM_CODES, JSON.stringify(codes));

    let successMessage = '兑换成功！';
    if (redeemCode.type === 'vip') {
      successMessage = `VIP会员开通成功！等级：${contentToRedeem.match(/VIP[123]/)?.[0] || 'VIP1'}，有效期：${daysMatch ? daysMatch[1] : 30}天`;
    } else if (redeemCode.type === 'verified') {
      successMessage = `金V认证开通成功！认证名称：${contentToRedeem}`;
    } else if (redeemCode.type === 'document') {
      successMessage = '兑换成功！请查看您的邮箱或联系管理员获取文档内容。';
    }

    return jsonResponse({ 
      success: true, 
      message: successMessage,
      type: redeemCode.type,
      value: contentToRedeem
    });
  }

  // 检查用户 VIP 状态
  if (path === '/api/vip/check' && method === 'GET') {
    const email = url.searchParams.get('email');
    if (!email) {
      return jsonResponse({ isVip: false });
    }

    const vipData = await env.MY_HOME_KV.get(STORAGE_KEYS.VIP_USERS);
    const vipUsers = vipData ? JSON.parse(vipData) : [];
    
    const vipUser = vipUsers.find(u => u.email === email);
    
    if (!vipUser) {
      return jsonResponse({ isVip: false });
    }

    // 检查是否过期
    const now = new Date();
    const expiryDate = new Date(vipUser.expiryDate);
    
    if (now > expiryDate) {
      return jsonResponse({ isVip: false, expired: true });
    }

    return jsonResponse({ 
      isVip: true, 
      level: vipUser.level,
      expiryDate: vipUser.expiryDate
    });
  }

  // 检查用户认证状态
  if (path === '/api/verified/check' && method === 'GET') {
    const email = url.searchParams.get('email');
    if (!email) {
      return jsonResponse({ isVerified: false });
    }

    const verifiedData = await env.MY_HOME_KV.get(STORAGE_KEYS.VERIFIED_USERS);
    const verifiedUsers = verifiedData ? JSON.parse(verifiedData) : [];
    
    const verifiedUser = verifiedUsers.find(u => u.email === email);
    
    if (verifiedUser) {
      return jsonResponse({ 
        isVerified: true,
        name: verifiedUser.name || '认证用户'
      });
    }
    
    return jsonResponse({ isVerified: false });
  }

  // 获取弹窗广告
  if (path === '/api/popup-ad' && method === 'GET') {
    const popupAd = await env.MY_HOME_KV.get(STORAGE_KEYS.POPUP_AD);
    return jsonResponse(popupAd ? JSON.parse(popupAd) : { enabled: false });
  }

  // 获取在线人数
  if (path === '/api/online-count' && method === 'GET') {
    const configData = await env.MY_HOME_KV.get(STORAGE_KEYS.ONLINE_COUNT_CONFIG);
    const config = configData ? JSON.parse(configData) : {
      realCountEnabled: false,
      fakeCountEnabled: false,
      fakeCountMin: 100,
      fakeCountMax: 500,
      fakeCountBase: 200
    };

    let count = 0;

    // 真实在线人数（基于访问记录）
    if (config.realCountEnabled) {
      const usersData = await env.MY_HOME_KV.get(STORAGE_KEYS.ONLINE_USERS);
      const users = usersData ? JSON.parse(usersData) : [];
      
      // 清理过期用户（5分钟内无活动视为离线）
      const now = Date.now();
      const activeUsers = users.filter(user => (now - user.lastSeen) < 5 * 60 * 1000);
      
      // 更新在线用户列表
      if (activeUsers.length !== users.length) {
        await env.MY_HOME_KV.put(STORAGE_KEYS.ONLINE_USERS, JSON.stringify(activeUsers));
      }
      
      count = activeUsers.length;
    }

    // 虚假人气（随机生成）
    if (config.fakeCountEnabled) {
      // 使用时间戳作为种子，确保同一分钟内数值相对稳定
      const timeSeed = Math.floor(Date.now() / 60000); // 每分钟变化
      const random = ((timeSeed * 9301 + 49297) % 233280) / 233280; // 伪随机数生成器
      
      // 在最小值和最大值之间随机
      const fakeCount = Math.floor(
        config.fakeCountBase + 
        (config.fakeCountMax - config.fakeCountMin) * random * 0.5
      );
      
      count = Math.max(count, fakeCount);
    }

    return jsonResponse({ count });
  }

  // 记录用户访问（用于真实在线人数统计）
  if (path === '/api/online-count/ping' && method === 'POST') {
    const configData = await env.MY_HOME_KV.get(STORAGE_KEYS.ONLINE_COUNT_CONFIG);
    const config = configData ? JSON.parse(configData) : { realCountEnabled: false };
    
    if (config.realCountEnabled) {
      const { clientId } = await request.json().catch(() => ({}));
      if (clientId) {
        const usersData = await env.MY_HOME_KV.get(STORAGE_KEYS.ONLINE_USERS);
        const users = usersData ? JSON.parse(usersData) : [];
        
        const now = Date.now();
        const existingIndex = users.findIndex(u => u.clientId === clientId);
        
        if (existingIndex !== -1) {
          users[existingIndex].lastSeen = now;
        } else {
          users.push({ clientId, lastSeen: now });
        }
        
        // 清理过期用户
        const activeUsers = users.filter(user => (now - user.lastSeen) < 5 * 60 * 1000);
        await env.MY_HOME_KV.put(STORAGE_KEYS.ONLINE_USERS, JSON.stringify(activeUsers));
      }
    }
    
    return jsonResponse({ success: true });
  }

  // 获取用户勋章
  if (path === '/api/badges/user' && method === 'GET') {
    const email = url.searchParams.get('email');
    if (!email) {
      return jsonResponse({ badges: [] });
    }

    const userBadgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_BADGES);
    const userBadges = userBadgesData ? JSON.parse(userBadgesData) : [];
    const badgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.BADGES);
    const badges = badgesData ? JSON.parse(badgesData) : {};

    const userBadgeList = userBadges
      .filter(ub => ub.email === email)
      .map(ub => ({
        id: ub.badgeId,
        ...badges[ub.badgeId],
        grantedAt: ub.grantedAt
      }));

    return jsonResponse({ badges: userBadgeList });
  }

  // 获取用户等级和经验
  if (path === '/api/level/user' && method === 'GET') {
    const email = url.searchParams.get('email');
    if (!email) {
      return jsonResponse({ level: 1, exp: 0, nextLevelExp: 100 });
    }

    const userLevelsData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_LEVELS);
    const userLevels = userLevelsData ? JSON.parse(userLevelsData) : [];
    const levelConfigData = await env.MY_HOME_KV.get(STORAGE_KEYS.LEVEL_CONFIG);
    const levelConfig = levelConfigData ? JSON.parse(levelConfigData) : {
      checkinExp: 10,
      levels: [{ level: 1, exp: 0 }, { level: 2, exp: 100 }]
    };

    const userLevel = userLevels.find(ul => ul.email === email) || { email, level: 1, exp: 0 };
    
    // 计算当前等级和下一级所需经验（支持新旧格式）
    let currentLevel = 1;
    let nextLevelExp = 100;
    const levels = levelConfig.levels || [];
    
    // 检查是否是新格式（有required_xp字段）
    const isNewFormat = levels.length > 0 && levels[0].required_xp !== undefined;
    
    if (isNewFormat) {
      // 新格式：使用required_xp（累计经验）
      for (let i = levels.length - 1; i >= 0; i--) {
        if (userLevel.exp >= levels[i].required_xp) {
          currentLevel = levels[i].level;
          if (i < levels.length - 1) {
            nextLevelExp = levels[i + 1].required_xp;
          } else {
            nextLevelExp = levels[i].required_xp + 500; // 最高级后每500经验升一级
          }
          break;
        }
      }
    } else {
      // 旧格式：使用exp字段（兼容）
      for (let i = levels.length - 1; i >= 0; i--) {
        if (userLevel.exp >= levels[i].exp) {
          currentLevel = levels[i].level;
          if (i < levels.length - 1) {
            nextLevelExp = levels[i + 1].exp;
          } else {
            nextLevelExp = levels[i].exp + 500;
          }
          break;
        }
      }
    }

    return jsonResponse({
      level: currentLevel,
      exp: userLevel.exp,
      nextLevelExp: nextLevelExp
    });
  }

  // 签到
  if (path === '/api/level/checkin' && method === 'POST') {
    const { email } = await request.json();
    if (!email) {
      return jsonResponse({ success: false, message: '请提供邮箱' }, 400);
    }

    const userLevelsData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_LEVELS);
    const userLevels = userLevelsData ? JSON.parse(userLevelsData) : [];
    const levelConfigData = await env.MY_HOME_KV.get(STORAGE_KEYS.LEVEL_CONFIG);
    const levelConfig = levelConfigData ? JSON.parse(levelConfigData) : { checkinExp: 10 };

    const userIndex = userLevels.findIndex(ul => ul.email === email);
    const today = new Date().toDateString();
    
    if (userIndex === -1) {
      userLevels.push({
        email,
        level: 1,
        exp: levelConfig.checkinExp,
        lastCheckin: today,
        checkinCount: 1
      });
    } else {
      // 检查今天是否已签到
      if (userLevels[userIndex].lastCheckin === today) {
        return jsonResponse({ success: false, message: '今日已签到' }, 400);
      }
      
      userLevels[userIndex].exp += levelConfig.checkinExp;
      userLevels[userIndex].lastCheckin = today;
      userLevels[userIndex].checkinCount = (userLevels[userIndex].checkinCount || 0) + 1;
    }

    await env.MY_HOME_KV.put(STORAGE_KEYS.USER_LEVELS, JSON.stringify(userLevels));

    return jsonResponse({
      success: true,
      message: `签到成功！获得 ${levelConfig.checkinExp} 经验`,
      exp: levelConfig.checkinExp
    });
  }

  // 获取时间线事件
  if (path === '/api/timeline' && method === 'GET') {
    const eventsData = await env.MY_HOME_KV.get(STORAGE_KEYS.TIMELINE_EVENTS);
    const events = eventsData ? JSON.parse(eventsData) : [];
    // 按时间倒序排列，只返回启用的
    const enabledEvents = events
      .filter(e => e.enabled !== false)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20); // 最多返回20条
    return jsonResponse({ events: enabledEvents });
  }

  // 获取等级配置（公开接口，用于前端显示等级名称）
  if (path === '/api/level-config' && method === 'GET') {
    const levelConfigData = await env.MY_HOME_KV.get(STORAGE_KEYS.LEVEL_CONFIG);
    const levelConfig = levelConfigData ? JSON.parse(levelConfigData) : {
      checkinExp: 10,
      leveling_rule: { type: 'cumulative' },
      levels: []
    };
    // 只返回必要的配置信息，不返回敏感数据
    return jsonResponse({
      leveling_rule: levelConfig.leveling_rule,
      levels: levelConfig.levels || []
    });
  }

  // ==================== 前端页面路由（无需认证）====================

  // 主页路由
  if (path === '/' || path === '/index.html') {
    // 添加时间戳绕过 GitHub CDN 缓存
    const cacheBuster = `?t=${Date.now()}`;
    const html = await fetch(`https://raw.githubusercontent.com/wuya521/my-homepage/main/index.html${cacheBuster}`)
      .then(res => res.text())
      .catch(() => '<h1>页面加载失败</h1>');
    
    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // 后台管理页面路由
  if (path === '/manage' || path === '/manage.html') {
    // 添加时间戳绕过 GitHub CDN 缓存
    const cacheBuster = `?t=${Date.now()}`;
    const html = await fetch(`https://raw.githubusercontent.com/wuya521/my-homepage/main/manage.html${cacheBuster}`)
      .then(res => res.text())
      .catch(() => '<h1>管理页面加载失败</h1>');
    
    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // 静态资源路由 (CSS/JS)
  if (path.startsWith('/static/')) {
    const fileName = path.split('/').pop();
    // 添加时间戳绕过 GitHub CDN 缓存
    const cacheBuster = `?t=${Date.now()}`;
    const fileUrl = `https://raw.githubusercontent.com/wuya521/my-homepage/main/static/${fileName}${cacheBuster}`;
    
    const response = await fetch(fileUrl);
    const content = await response.text();
    
    let contentType = 'text/plain';
    if (fileName.endsWith('.css')) contentType = 'text/css';
    if (fileName.endsWith('.js')) contentType = 'application/javascript';
    
    return new Response(content, {
      headers: { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  // ==================== 管理员 API ====================

  // 验证管理员登录（不需要提前认证）
  if (path === '/api/admin/login' && method === 'POST') {
    const isValid = await verifyAdmin(request, env.MY_HOME_KV);
    
    if (isValid) {
      return jsonResponse({ success: true, message: '登录成功' });
    } else {
      return jsonResponse({ success: false, message: '用户名或密码错误' }, 401);
    }
  }

  // ==================== 需要认证的管理员 API ====================
  // 以下所有接口都需要管理员认证
  const isAdmin = await verifyAdmin(request, env.MY_HOME_KV);
  if (!isAdmin) {
    return jsonResponse({ success: false, message: '未授权访问' }, 401);
  }

  // 修改管理员密码
  if (path === '/api/admin/password' && method === 'PUT') {
    const { currentPassword, newPassword } = await request.json();
    
    const adminData = await env.MY_HOME_KV.get(STORAGE_KEYS.ADMIN);
    const admin = JSON.parse(adminData);

    if (admin.password !== currentPassword) {
      return jsonResponse({ success: false, message: '当前密码错误' }, 400);
    }

    admin.password = newPassword;
    await env.MY_HOME_KV.put(STORAGE_KEYS.ADMIN, JSON.stringify(admin));

    return jsonResponse({ success: true, message: '密码修改成功' });
  }

  // 更新个人资料
  if (path === '/api/profile' && method === 'PUT') {
    const profile = await request.json();
    await env.MY_HOME_KV.put(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    return jsonResponse({ success: true, message: '个人资料更新成功' });
  }

  // 更新公告
  if (path === '/api/announcement' && method === 'PUT') {
    const announcement = await request.json();
    announcement.updatedAt = new Date().toISOString();
    await env.MY_HOME_KV.put(STORAGE_KEYS.ANNOUNCEMENT, JSON.stringify(announcement));
    return jsonResponse({ success: true, message: '公告更新成功' });
  }

  // 获取所有门户（包括禁用的）
  if (path === '/api/admin/portals' && method === 'GET') {
    const portals = await env.MY_HOME_KV.get(STORAGE_KEYS.PORTALS);
    return jsonResponse(portals ? JSON.parse(portals) : []);
  }

  // 更新门户列表
  if (path === '/api/portals' && method === 'PUT') {
    const portals = await request.json();
    await env.MY_HOME_KV.put(STORAGE_KEYS.PORTALS, JSON.stringify(portals));
    return jsonResponse({ success: true, message: '门户列表更新成功' });
  }

  // 获取所有兑换码
  if (path === '/api/admin/redeem-codes' && method === 'GET') {
    const codes = await env.MY_HOME_KV.get(STORAGE_KEYS.REDEEM_CODES);
    return jsonResponse(codes ? JSON.parse(codes) : []);
  }

  // 生成新兑换码
  if (path === '/api/admin/redeem-codes' && method === 'POST') {
    const { type, value, count = 1, description = '', availableContents = [], documentContent = '' } = await request.json();
    
    const codesData = await env.MY_HOME_KV.get(STORAGE_KEYS.REDEEM_CODES);
    const codes = codesData ? JSON.parse(codesData) : [];
    
    const newCodes = [];
    for (let i = 0; i < count; i++) {
      const code = {
        code: generateRedeemCode(),
        type, // 'vip'、'verified'、'document' 或其他自定义类型
        value, // 默认值
        description,
        availableContents, // 可选内容列表，前端可以选择
        documentContent, // 文档类型的内容（账号密码等）
        used: false,
        createdAt: new Date().toISOString()
      };
      codes.push(code);
      newCodes.push(code);
    }
    
    await env.MY_HOME_KV.put(STORAGE_KEYS.REDEEM_CODES, JSON.stringify(codes));
    
    return jsonResponse({ 
      success: true, 
      message: `成功生成 ${count} 个兑换码`,
      codes: newCodes
    });
  }

  // 删除兑换码
  if (path === '/api/admin/redeem-codes' && method === 'DELETE') {
    const { code } = await request.json();
    
    const codesData = await env.MY_HOME_KV.get(STORAGE_KEYS.REDEEM_CODES);
    const codes = codesData ? JSON.parse(codesData) : [];
    
    const filteredCodes = codes.filter(c => c.code !== code);
    await env.MY_HOME_KV.put(STORAGE_KEYS.REDEEM_CODES, JSON.stringify(filteredCodes));
    
    return jsonResponse({ success: true, message: '兑换码已删除' });
  }

  // 获取所有 VIP 用户
  if (path === '/api/admin/vip-users' && method === 'GET') {
    const vipUsers = await env.MY_HOME_KV.get(STORAGE_KEYS.VIP_USERS);
    return jsonResponse(vipUsers ? JSON.parse(vipUsers) : []);
  }

  // 添加 VIP 用户
  if (path === '/api/admin/vip-users' && method === 'POST') {
    const { email, level, days } = await request.json();
    
    const vipData = await env.MY_HOME_KV.get(STORAGE_KEYS.VIP_USERS);
    const vipUsers = vipData ? JSON.parse(vipData) : [];
    
    // 检查是否已存在
    const existingIndex = vipUsers.findIndex(u => u.email === email);
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    const vipUser = {
      email,
      level,
      expiryDate: expiryDate.toISOString(),
      createdAt: new Date().toISOString()
    };
    
    if (existingIndex !== -1) {
      vipUsers[existingIndex] = vipUser;
    } else {
      vipUsers.push(vipUser);
    }
    
    await env.MY_HOME_KV.put(STORAGE_KEYS.VIP_USERS, JSON.stringify(vipUsers));
    
    return jsonResponse({ success: true, message: 'VIP 用户添加成功' });
  }

  // 删除 VIP 用户
  if (path === '/api/admin/vip-users' && method === 'DELETE') {
    const { email } = await request.json();
    
    const vipData = await env.MY_HOME_KV.get(STORAGE_KEYS.VIP_USERS);
    const vipUsers = vipData ? JSON.parse(vipData) : [];
    
    const filteredUsers = vipUsers.filter(u => u.email !== email);
    await env.MY_HOME_KV.put(STORAGE_KEYS.VIP_USERS, JSON.stringify(filteredUsers));
    
    return jsonResponse({ success: true, message: 'VIP 用户已删除' });
  }

  // 获取所有认证用户
  if (path === '/api/admin/verified-users' && method === 'GET') {
    const verifiedUsers = await env.MY_HOME_KV.get(STORAGE_KEYS.VERIFIED_USERS);
    return jsonResponse(verifiedUsers ? JSON.parse(verifiedUsers) : []);
  }

  // 添加认证用户
  if (path === '/api/admin/verified-users' && method === 'POST') {
    const { email, name } = await request.json();
    
    const verifiedData = await env.MY_HOME_KV.get(STORAGE_KEYS.VERIFIED_USERS);
    const verifiedUsers = verifiedData ? JSON.parse(verifiedData) : [];
    
    // 检查是否已存在
    if (verifiedUsers.some(u => u.email === email)) {
      return jsonResponse({ success: false, message: '该用户已认证' }, 400);
    }
    
    verifiedUsers.push({
      email,
      name,
      verifiedAt: new Date().toISOString()
    });
    
    await env.MY_HOME_KV.put(STORAGE_KEYS.VERIFIED_USERS, JSON.stringify(verifiedUsers));
    
    return jsonResponse({ success: true, message: '金V认证添加成功' });
  }

  // 删除认证用户
  if (path === '/api/admin/verified-users' && method === 'DELETE') {
    const { email } = await request.json();
    
    const verifiedData = await env.MY_HOME_KV.get(STORAGE_KEYS.VERIFIED_USERS);
    const verifiedUsers = verifiedData ? JSON.parse(verifiedData) : [];
    
    const filteredUsers = verifiedUsers.filter(u => u.email !== email);
    await env.MY_HOME_KV.put(STORAGE_KEYS.VERIFIED_USERS, JSON.stringify(filteredUsers));
    
    return jsonResponse({ success: true, message: '金V认证已删除' });
  }

  // 获取所有广告位（包括禁用的）
  if (path === '/api/admin/advertisements' && method === 'GET') {
    try {
      const ads = await env.MY_HOME_KV.get(STORAGE_KEYS.ADVERTISEMENTS);
      return jsonResponse(ads ? JSON.parse(ads) : []);
    } catch (error) {
      console.error('获取广告位失败:', error);
      return jsonResponse({ error: '获取广告位失败', message: error.message }, 500);
    }
  }

  // 更新广告位列表
  if (path === '/api/admin/advertisements' && method === 'PUT') {
    try {
      const advertisements = await request.json();
      await env.MY_HOME_KV.put(STORAGE_KEYS.ADVERTISEMENTS, JSON.stringify(advertisements));
      return jsonResponse({ success: true, message: '广告位列表更新成功' });
    } catch (error) {
      console.error('更新广告位失败:', error);
      return jsonResponse({ error: '更新广告位失败', message: error.message }, 500);
    }
  }

  // 获取弹窗广告（管理员）
  if (path === '/api/admin/popup-ad' && method === 'GET') {
    try {
      const popupAd = await env.MY_HOME_KV.get(STORAGE_KEYS.POPUP_AD);
      return jsonResponse(popupAd ? JSON.parse(popupAd) : { enabled: false, content: '', frequency: 'daily' });
    } catch (error) {
      console.error('获取弹窗广告失败:', error);
      return jsonResponse({ error: '获取弹窗广告失败', message: error.message }, 500);
    }
  }

  // 更新弹窗广告
  if (path === '/api/admin/popup-ad' && method === 'PUT') {
    try {
      const popupAd = await request.json();
      // 更新ID和时间戳
      popupAd.id = popupAd.id || Date.now().toString();
      popupAd.updatedAt = new Date().toISOString();
      await env.MY_HOME_KV.put(STORAGE_KEYS.POPUP_AD, JSON.stringify(popupAd));
      return jsonResponse({ success: true, message: '弹窗广告更新成功' });
    } catch (error) {
      console.error('更新弹窗广告失败:', error);
      return jsonResponse({ error: '更新弹窗广告失败', message: error.message }, 500);
    }
  }

  // 获取在线人数配置
  if (path === '/api/admin/online-count-config' && method === 'GET') {
    try {
      const configData = await env.MY_HOME_KV.get(STORAGE_KEYS.ONLINE_COUNT_CONFIG);
      const config = configData ? JSON.parse(configData) : {
        realCountEnabled: false,
        fakeCountEnabled: false,
        fakeCountMin: 100,
        fakeCountMax: 500,
        fakeCountBase: 200
      };
      return jsonResponse(config);
    } catch (error) {
      console.error('获取在线人数配置失败:', error);
      return jsonResponse({ error: '获取配置失败', message: error.message }, 500);
    }
  }

  // 更新在线人数配置
  if (path === '/api/admin/online-count-config' && method === 'PUT') {
    try {
      const config = await request.json();
      // 验证配置
      if (config.fakeCountMin < 0 || config.fakeCountMax < 0 || config.fakeCountBase < 0) {
        return jsonResponse({ error: '配置值不能为负数' }, 400);
      }
      if (config.fakeCountMin > config.fakeCountMax) {
        return jsonResponse({ error: '最小值不能大于最大值' }, 400);
      }
      
      await env.MY_HOME_KV.put(STORAGE_KEYS.ONLINE_COUNT_CONFIG, JSON.stringify(config));
      return jsonResponse({ success: true, message: '在线人数配置更新成功' });
    } catch (error) {
      console.error('更新在线人数配置失败:', error);
      return jsonResponse({ error: '更新配置失败', message: error.message }, 500);
    }
  }

  // 获取所有勋章定义
  if (path === '/api/admin/badges' && method === 'GET') {
    const badgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.BADGES);
    return jsonResponse(badgesData ? JSON.parse(badgesData) : {});
  }

  // 更新勋章定义
  if (path === '/api/admin/badges' && method === 'PUT') {
    const badges = await request.json();
    await env.MY_HOME_KV.put(STORAGE_KEYS.BADGES, JSON.stringify(badges));
    return jsonResponse({ success: true, message: '勋章定义更新成功' });
  }

  // 获取所有用户勋章列表
  if (path === '/api/admin/user-badges' && method === 'GET') {
    const userBadgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_BADGES);
    const userBadges = userBadgesData ? JSON.parse(userBadgesData) : [];
    const badgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.BADGES);
    const badges = badgesData ? JSON.parse(badgesData) : {};

    const badgeList = userBadges.map(ub => ({
      email: ub.email,
      badgeId: ub.badgeId,
      badgeName: badges[ub.badgeId]?.name || ub.badgeId,
      grantedAt: ub.grantedAt
    }));

    return jsonResponse(badgeList);
  }

  // 授予勋章
  if (path === '/api/admin/badges/grant' && method === 'POST') {
    const { email, badgeId } = await request.json();
    if (!email || !badgeId) {
      return jsonResponse({ success: false, message: '请提供邮箱和勋章ID' }, 400);
    }

    const userBadgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_BADGES);
    const userBadges = userBadgesData ? JSON.parse(userBadgesData) : [];

    // 检查是否已授予
    if (userBadges.some(ub => ub.email === email && ub.badgeId === badgeId)) {
      return jsonResponse({ success: false, message: '该用户已拥有此勋章' }, 400);
    }

    userBadges.push({
      email,
      badgeId,
      grantedAt: new Date().toISOString()
    });

    await env.MY_HOME_KV.put(STORAGE_KEYS.USER_BADGES, JSON.stringify(userBadges));
    return jsonResponse({ success: true, message: '勋章授予成功' });
  }

  // 移除勋章
  if (path === '/api/admin/badges/revoke' && method === 'POST') {
    const { email, badgeId } = await request.json();
    if (!email || !badgeId) {
      return jsonResponse({ success: false, message: '请提供邮箱和勋章ID' }, 400);
    }

    const userBadgesData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_BADGES);
    const userBadges = userBadgesData ? JSON.parse(userBadgesData) : [];

    const filtered = userBadges.filter(ub => !(ub.email === email && ub.badgeId === badgeId));
    await env.MY_HOME_KV.put(STORAGE_KEYS.USER_BADGES, JSON.stringify(filtered));
    return jsonResponse({ success: true, message: '勋章已移除' });
  }

  // 获取所有用户等级
  if (path === '/api/admin/user-levels' && method === 'GET') {
    const userLevelsData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_LEVELS);
    return jsonResponse(userLevelsData ? JSON.parse(userLevelsData) : []);
  }

  // 发放经验
  if (path === '/api/admin/user-levels/add-exp' && method === 'POST') {
    const { email, exp, reason } = await request.json();
    if (!email || !exp) {
      return jsonResponse({ success: false, message: '请提供邮箱和经验值' }, 400);
    }

    const userLevelsData = await env.MY_HOME_KV.get(STORAGE_KEYS.USER_LEVELS);
    const userLevels = userLevelsData ? JSON.parse(userLevelsData) : [];

    const userIndex = userLevels.findIndex(ul => ul.email === email);
    if (userIndex === -1) {
      userLevels.push({
        email,
        level: 1,
        exp: parseInt(exp),
        checkinCount: 0
      });
    } else {
      userLevels[userIndex].exp += parseInt(exp);
    }

    await env.MY_HOME_KV.put(STORAGE_KEYS.USER_LEVELS, JSON.stringify(userLevels));
    return jsonResponse({ success: true, message: `成功发放 ${exp} 经验` });
  }

  // 获取等级配置
  if (path === '/api/admin/level-config' && method === 'GET') {
    const levelConfigData = await env.MY_HOME_KV.get(STORAGE_KEYS.LEVEL_CONFIG);
    return jsonResponse(levelConfigData ? JSON.parse(levelConfigData) : { checkinExp: 10, levels: [] });
  }

  // 更新等级配置
  if (path === '/api/admin/level-config' && method === 'PUT') {
    const config = await request.json();
    await env.MY_HOME_KV.put(STORAGE_KEYS.LEVEL_CONFIG, JSON.stringify(config));
    return jsonResponse({ success: true, message: '等级配置更新成功' });
  }

  // 获取所有时间线事件
  if (path === '/api/admin/timeline' && method === 'GET') {
    const eventsData = await env.MY_HOME_KV.get(STORAGE_KEYS.TIMELINE_EVENTS);
    return jsonResponse(eventsData ? JSON.parse(eventsData) : []);
  }

  // 添加时间线事件
  if (path === '/api/admin/timeline' && method === 'POST') {
    const { date, content, enabled } = await request.json();
    if (!date || !content) {
      return jsonResponse({ success: false, message: '请提供日期和内容' }, 400);
    }

    const eventsData = await env.MY_HOME_KV.get(STORAGE_KEYS.TIMELINE_EVENTS);
    const events = eventsData ? JSON.parse(eventsData) : [];

    events.push({
      id: Date.now().toString(),
      date,
      content,
      enabled: enabled !== false,
      createdAt: new Date().toISOString()
    });

    await env.MY_HOME_KV.put(STORAGE_KEYS.TIMELINE_EVENTS, JSON.stringify(events));
    return jsonResponse({ success: true, message: '事件添加成功' });
  }

  // 更新时间线事件
  if (path === '/api/admin/timeline' && method === 'PUT') {
    const { id, date, content, enabled } = await request.json();
    if (!id) {
      return jsonResponse({ success: false, message: '请提供事件ID' }, 400);
    }

    const eventsData = await env.MY_HOME_KV.get(STORAGE_KEYS.TIMELINE_EVENTS);
    const events = eventsData ? JSON.parse(eventsData) : [];

    const eventIndex = events.findIndex(e => e.id === id);
    if (eventIndex === -1) {
      return jsonResponse({ success: false, message: '事件不存在' }, 404);
    }

    if (date) events[eventIndex].date = date;
    if (content) events[eventIndex].content = content;
    if (enabled !== undefined) events[eventIndex].enabled = enabled;

    await env.MY_HOME_KV.put(STORAGE_KEYS.TIMELINE_EVENTS, JSON.stringify(events));
    return jsonResponse({ success: true, message: '事件更新成功' });
  }

  // 删除时间线事件
  if (path === '/api/admin/timeline' && method === 'DELETE') {
    const { id } = await request.json();
    if (!id) {
      return jsonResponse({ success: false, message: '请提供事件ID' }, 400);
    }

    const eventsData = await env.MY_HOME_KV.get(STORAGE_KEYS.TIMELINE_EVENTS);
    const events = eventsData ? JSON.parse(eventsData) : [];

    const filtered = events.filter(e => e.id !== id);
    await env.MY_HOME_KV.put(STORAGE_KEYS.TIMELINE_EVENTS, JSON.stringify(filtered));
    return jsonResponse({ success: true, message: '事件删除成功' });
  }

  // 404 响应
  return jsonResponse({ error: '接口不存在' }, 404);
}

// Cloudflare Worker 入口
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('服务器错误:', error);
      return jsonResponse({ 
        error: '服务器内部错误', 
        message: error.message 
      }, 500);
    }
  }
};


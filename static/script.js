// ==================== 全局配置 ====================
// 重要：请将下面的 API_BASE 修改为你的 Cloudflare Worker 域名
// 如果 window.API_BASE 已在页面中定义，则使用它，否则使用默认值
if (!window.API_BASE) {
  window.API_BASE = 'https://yahoohhblog.zalkbodenstein.workers.dev';
}
const API_BASE = window.API_BASE;

// 全局状态
let authToken = null;
let currentPortals = [];
let currentAdvertisements = [];

// ==================== 工具函数 ====================

// 显示消息
function showMessage(elementId, message, type = 'success') {
    const messageEl = document.getElementById(elementId);
    if (!messageEl) return;
    
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// API 请求封装
async function apiRequest(endpoint, options = {}) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // 添加认证头
        if (authToken) {
            headers['Authorization'] = authToken;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            // 提供更详细的错误信息
            let errorMessage = data.message || data.error || '请求失败';
            if (response.status === 401) {
                errorMessage = '未授权访问，请重新登录';
            } else if (response.status === 404) {
                errorMessage = '接口不存在，请检查API路径';
            } else if (response.status >= 500) {
                errorMessage = '服务器错误，请稍后重试';
            }
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        console.error('API 请求错误:', {
            endpoint,
            error: error.message,
            status: error.status
        });
        throw error;
    }
}

// 格式化日期
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== 主页功能 ====================

// 生成随机头像
function generateRandomAvatar(name = '') {
    // 使用 DiceBear API 生成随机头像
    // 使用名字作为种子，确保同一用户头像一致
    const seed = name || Math.random().toString(36).substring(7);
    
    // 使用多种风格，根据种子选择，确保同一用户使用相同风格
    // adventurer: 帅气风格, lorelei: 可爱风格, notionists: 抽象风格, shapes: 几何风格
    const styles = ['adventurer', 'lorelei', 'notionists', 'shapes'];
    const styleIndex = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % styles.length;
    const style = styles[styleIndex];
    
    // 使用友好的背景色（浅色系：蓝色、紫色、粉色、米色等）
    const backgroundColor = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,a8d5e2,e0f2fe,ddd6fe';
    
    // 构建URL参数
    const params = new URLSearchParams({
        seed: seed,
        backgroundColor: backgroundColor,
    });
    
    return `https://api.dicebear.com/7.x/${style}/svg?${params.toString()}`;
}

// 加载个人资料
async function loadProfile() {
    try {
        const profile = await apiRequest('/api/profile');
        
        // 更新头像（如果没有设置头像，使用随机生成）
        const avatarEl = document.getElementById('avatar');
        if (avatarEl) {
            if (profile.avatar && profile.avatar.trim() && !profile.avatar.includes('placeholder')) {
                avatarEl.src = profile.avatar;
            } else {
                // 使用名字生成随机头像
                avatarEl.src = generateRandomAvatar(profile.name || profile.email);
            }
        }

        // 更新名字
        const nameEl = document.getElementById('name');
        if (nameEl && profile.name) {
            nameEl.textContent = profile.name;
        }

        // 更新简介
        const bioEl = document.getElementById('bio');
        if (bioEl && profile.bio) {
            bioEl.textContent = profile.bio;
        }

        // 更新社交链接
        updateSocialLink('email-link', profile.email, `mailto:${profile.email}`);
        updateSocialLink('github-link', profile.github, profile.github);
        updateSocialLink('twitter-link', profile.twitter, profile.twitter);
        updateSocialLink('website-link', profile.website, profile.website);

        // 检查并显示金V认证标识
        if (profile.email) {
            await checkAndShowGoldVerified(profile.email);
            // 检查并显示VIP状态
            await checkAndShowVipStatus(profile.email);
            // 加载用户勋章
            await loadUserBadges(profile.email);
            // 加载用户等级
            await loadUserLevel(profile.email);
        } else {
            // 即使没有邮箱，也显示VIP状态为未开通
            const vipStatusText = document.querySelector('#vip-status-info .vip-status-text');
            if (vipStatusText) {
                vipStatusText.textContent = '未开通';
                vipStatusText.className = 'vip-status-text';
            }
        }

        // 加载时间线事件
        await loadTimeline();

    } catch (error) {
        console.error('加载个人资料失败:', error);
    }
}

// 检查并显示金V认证标识
async function checkAndShowGoldVerified(email) {
    try {
        const result = await apiRequest(`/api/verified/check?email=${encodeURIComponent(email)}`);
        const badgeEl = document.getElementById('gold-verified-badge');
        if (badgeEl && result.isVerified) {
            badgeEl.style.display = 'flex';
            // 设置认证名称用于tooltip显示
            if (result.name) {
                badgeEl.setAttribute('data-verified-name', result.name);
            }
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
    }
}

// 更新社交链接
function updateSocialLink(elementId, value, href) {
    const linkEl = document.getElementById(elementId);
    if (linkEl) {
        if (value) {
            linkEl.href = href;
            linkEl.style.display = 'flex';
        } else {
            linkEl.style.display = 'none';
        }
    }
}

// 加载公告
async function loadAnnouncement() {
    try {
        const announcement = await apiRequest('/api/announcement');
        
        const section = document.getElementById('announcement-section');
        const titleEl = document.getElementById('announcement-title');
        const contentEl = document.getElementById('announcement-content');
        const timeEl = document.getElementById('announcement-time');

        if (announcement && announcement.enabled) {
            if (titleEl) titleEl.textContent = announcement.title || '公告';
            // 支持Markdown格式
            if (contentEl && announcement.content) {
                if (typeof marked !== 'undefined') {
                    contentEl.innerHTML = marked.parse(announcement.content);
                } else {
                    contentEl.textContent = announcement.content;
                }
            }
            if (timeEl) timeEl.textContent = `更新于 ${formatDate(announcement.updatedAt)}`;
            if (section) section.style.display = 'block';
        } else {
            if (section) section.style.display = 'none';
        }
    } catch (error) {
        console.error('加载公告失败:', error);
    }
}

// 加载广告位
async function loadAdvertisements() {
    try {
        const ads = await apiRequest('/api/advertisements');
        const section = document.getElementById('advertisements-section');
        const container = document.getElementById('advertisements-container');
        
        if (!section || !container) return;

        if (ads.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = ads.map(ad => `
            <a href="${ad.link || '#'}" target="_blank" class="advertisement-card" ${ad.image ? `style="background-image: url('${ad.image}');"` : ''}>
                ${ad.image ? '' : `<div class="ad-icon">${ad.icon || '📢'}</div>`}
                <div class="ad-content">
                    ${ad.title ? `<h3 class="ad-title">${ad.title}</h3>` : ''}
                    ${ad.description ? `<p class="ad-desc">${ad.description}</p>` : ''}
                </div>
            </a>
        `).join('');
    } catch (error) {
        console.error('加载广告位失败:', error);
    }
}

// 加载弹窗广告
async function loadPopupAd() {
    try {
        const popupAd = await apiRequest('/api/popup-ad');
        if (popupAd && popupAd.enabled) {
            // 检查是否需要显示弹窗
            const shouldShow = await shouldShowPopupAd(popupAd);
            if (shouldShow) {
                showPopupAd(popupAd);
                // 记录显示时间
                if (popupAd.frequency === 'daily') {
                    localStorage.setItem('popupAdLastShown', Date.now().toString());
                }
            }
        }
    } catch (error) {
        console.error('加载弹窗广告失败:', error);
    }
}

// 判断是否应该显示弹窗
async function shouldShowPopupAd(popupAd) {
    if (!popupAd || !popupAd.enabled) {
        return false;
    }
    
    if (popupAd.frequency === 'manual') {
        // 手动推送：检查是否有新的推送标记
        const lastManualId = localStorage.getItem('popupAdLastManualId');
        const currentId = popupAd.id || popupAd.updatedAt || 'default';
        if (lastManualId !== currentId) {
            return true;
        }
        return false;
    } else if (popupAd.frequency === 'daily') {
        // 一天一次：检查今天是否已显示
        const lastShown = localStorage.getItem('popupAdLastShown');
        if (!lastShown) {
            return true;
        }
        const lastShownTime = parseInt(lastShown);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        return (now - lastShownTime) >= oneDay;
    }
    return false;
}

// 显示弹窗广告
function showPopupAd(popupAd) {
    const overlay = document.getElementById('popup-ad-overlay');
    const content = document.getElementById('popup-ad-content');
    
    if (!overlay || !content) return;
    
    // 支持HTML格式，但移除内容中可能存在的关闭按钮
    let htmlContent = popupAd.content || '';
    // 移除内容中可能存在的关闭按钮（通过类名或ID匹配）
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    // 移除所有可能的关闭按钮
    const closeButtons = tempDiv.querySelectorAll('.popup-ad-close, .close, [onclick*="close"], button.close, .close-btn');
    closeButtons.forEach(btn => btn.remove());
    htmlContent = tempDiv.innerHTML;
    
    content.innerHTML = htmlContent;
    
    overlay.style.display = 'flex';
    
    // 记录手动推送的ID
    if (popupAd.frequency === 'manual') {
        const currentId = popupAd.id || popupAd.updatedAt || Date.now().toString();
        localStorage.setItem('popupAdLastManualId', currentId);
    }
}

// 关闭弹窗广告
function closePopupAd() {
    const overlay = document.getElementById('popup-ad-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// 点击遮罩层关闭弹窗
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('popup-ad-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePopupAd();
            }
        });
    }
});

// 标签颜色映射
const tagColors = {
    '置顶': '#FFD700',
    '火爆': '#FF4500',
    '已认证': '#10b981',
    '推广': '#667eea',
    '热门': '#FF6B6B',
    '推荐': '#4ECDC4'
};

// 加载门户链接
async function loadPortals() {
    try {
        const portals = await apiRequest('/api/portals');
        const container = document.getElementById('portals-container');
        
        if (!container) return;

        // 只显示实际的门户，不显示占位卡片
        if (portals.length === 0) {
            container.innerHTML = '';
            // 根据配置决定是否显示鱼缸
            setTimeout(async () => {
                await loadFishTankConfigForFrontend();
                // 确保 minPortalsToHide 正确解析（0 是有效值，不应该被 || 覆盖）
                const minPortals = fishTankConfig.minPortalsToHide !== undefined ? fishTankConfig.minPortalsToHide : 3;
                console.log(`门户数量: 0, 阈值: ${minPortals}, 配置启用: ${fishTankConfig.enabled}`);
                // 如果 minPortals === 0，始终显示；否则当门户数量 < 阈值时显示
                if (fishTankConfig.enabled && (minPortals === 0 || 0 < minPortals)) {
                    console.log('显示鱼缸（无门户）');
                    showFishTank();
                } else {
                    console.log('隐藏鱼缸（无门户）');
                    hideFishTank();
                }
            }, 100);
            return;
        }

        container.innerHTML = portals.map(portal => renderPortalCard(portal)).join('');
        
        // 根据配置决定是否显示鱼缸
        setTimeout(async () => {
            await loadFishTankConfigForFrontend();
            // 确保 minPortalsToHide 正确解析（0 是有效值，不应该被 || 覆盖）
            const minPortals = fishTankConfig.minPortalsToHide !== undefined ? fishTankConfig.minPortalsToHide : 3;
            console.log(`门户数量: ${portals.length}, 阈值: ${minPortals}, 配置启用: ${fishTankConfig.enabled}`);
            // 如果 minPortals === 0，始终显示；否则当门户数量 < 阈值时显示
            if (fishTankConfig.enabled && (minPortals === 0 || portals.length < minPortals)) {
                console.log('显示鱼缸');
                showFishTank();
            } else {
                console.log('隐藏鱼缸');
                hideFishTank();
            }
        }, 100);
    } catch (error) {
        console.error('加载门户链接失败:', error);
    }
}

function renderPortalCard(portal) {
    const tags = portal.tags || [];
    const tagBadges = tags.map(tag => {
        const color = tagColors[tag] || '#8A8F98';
        return `<span class="portal-tag" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${tag}</span>`;
    }).join('');
    
    return `
        <a href="${portal.url}" target="_blank" class="portal-card ${portal.pinned ? 'pinned' : ''}">
            ${portal.pinned ? '<span class="pinned-badge">置顶</span>' : ''}
            <div class="portal-icon">${portal.icon || '🔗'}</div>
            <div class="portal-info">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                    <h3 class="portal-name">${portal.name}</h3>
                    ${tagBadges}
                </div>
                <p class="portal-desc">${portal.description || ''}</p>
            </div>
        </a>
    `;
}

// 鱼缸配置（全局变量，用于前端显示）
let fishTankConfig = {
    enabled: true,
    minPortalsToHide: 3
};

// 确保配置始终有默认值
function ensureFishTankConfig() {
    if (!fishTankConfig || typeof fishTankConfig !== 'object') {
        fishTankConfig = {
            enabled: true,
            minPortalsToHide: 3
        };
    }
    if (fishTankConfig.enabled === undefined) {
        fishTankConfig.enabled = true;
    }
    // 注意：minPortalsToHide 为 0 是有效值，不应该被覆盖
    if (fishTankConfig.minPortalsToHide === undefined || fishTankConfig.minPortalsToHide === null) {
        fishTankConfig.minPortalsToHide = 3;
    } else {
        // 确保是数字类型
        fishTankConfig.minPortalsToHide = parseInt(fishTankConfig.minPortalsToHide);
    }
}

// 加载鱼缸配置（前端公开接口，用于主页显示）
async function loadFishTankConfigForFrontend() {
    try {
        fishTankConfig = await apiRequest('/api/fish-tank-config');
        // 确保配置正确解析，特别是 minPortalsToHide 为 0 的情况
        if (fishTankConfig && typeof fishTankConfig.minPortalsToHide !== 'undefined') {
            fishTankConfig.minPortalsToHide = parseInt(fishTankConfig.minPortalsToHide) || 0;
        }
        ensureFishTankConfig();
    } catch (error) {
        console.error('加载鱼缸配置失败:', error);
        // 使用默认值
        ensureFishTankConfig();
    }
}

// 显示鱼缸动画
async function showFishTank() {
    // 先加载配置（使用前端公开接口）
    await loadFishTankConfigForFrontend();
    
    console.log('鱼缸配置:', fishTankConfig);
    
    // 如果未启用，不显示
    if (!fishTankConfig.enabled) {
        console.log('鱼缸未启用，隐藏');
        hideFishTank();
        return;
    }
    
    let fishTankContainer = document.getElementById('fish-tank-container');
    if (!fishTankContainer) {
        console.error('找不到鱼缸容器');
        return;
    }
    
    // 随机生成3-6条鱼，增加多样性
    const fishEmojis = ['🐟', '🐠', '🐡', '🦈', '🐙', '🦑', '🐋', '🐬', '🦐', '🦀'];
    const fishCount = Math.floor(Math.random() * 4) + 3; // 3-6条
    const selectedFish = [];
    for (let i = 0; i < fishCount; i++) {
        const randomFish = fishEmojis[Math.floor(Math.random() * fishEmojis.length)];
        selectedFish.push(randomFish);
    }
    
    // 生成气泡（8-12个），增加气泡数量让效果更丰富
    const bubbleCount = Math.floor(Math.random() * 5) + 8;
    const bubbles = [];
    for (let i = 1; i <= bubbleCount; i++) {
        bubbles.push(`<div class="bubble bubble-${i}"></div>`);
    }
    
    fishTankContainer.style.display = 'block';
    fishTankContainer.innerHTML = `
        <div class="fish-tank">
            <div class="fish-tank-water">
                ${selectedFish.map((fish, index) => 
                    `<div class="fish fish-${index + 1}">${fish}</div>`
                ).join('')}
                ${bubbles.join('')}
            </div>
        </div>
    `;
    
    // 动态设置每条鱼的动画参数
    selectedFish.forEach((fish, index) => {
        const fishElement = fishTankContainer.querySelector(`.fish-${index + 1}`);
        if (fishElement) {
            const duration = 8 + Math.random() * 4; // 8-12秒
            const delay = Math.random() * 3; // 0-3秒延迟
            const top = 15 + Math.random() * 70; // 15-85%位置
            fishElement.style.animation = `fishSwim ${duration}s ease-in-out infinite`;
            fishElement.style.animationDelay = `${delay}s`;
            fishElement.style.top = `${top}%`;
        }
    });
    
    // 动态设置气泡参数
    for (let i = 1; i <= bubbleCount; i++) {
        const bubbleElement = fishTankContainer.querySelector(`.bubble-${i}`);
        if (bubbleElement) {
            const left = Math.random() * 90; // 0-90%位置
            const size = 6 + Math.random() * 8; // 6-14px
            const duration = 3 + Math.random() * 2; // 3-5秒
            const delay = Math.random() * 2; // 0-2秒延迟
            bubbleElement.style.left = `${left}%`;
            bubbleElement.style.width = `${size}px`;
            bubbleElement.style.height = `${size}px`;
            bubbleElement.style.animationDuration = `${duration}s`;
            bubbleElement.style.animationDelay = `${delay}s`;
        }
    }
}

// 隐藏鱼缸动画
function hideFishTank() {
    const fishTankContainer = document.getElementById('fish-tank-container');
    if (fishTankContainer) {
        fishTankContainer.style.display = 'none';
    }
}

// 检查兑换码并加载可选内容
async function checkRedeemCode(code) {
    if (!code || code.replace(/-/g, '').length < 16) {
        return null;
    }
    
    try {
        const result = await apiRequest(`/api/redeem/check?code=${encodeURIComponent(code)}`);
        return result;
    } catch (error) {
        return null;
    }
}

// 兑换码输入时检查并显示可选内容
let currentRedeemCodeInfo = null;

// 兑换码提交
async function handleRedeemSubmit(e) {
    e.preventDefault();
    
    const codeInput = document.getElementById('redeem-code');
    const emailInput = document.getElementById('redeem-email');
    const contentSelector = document.getElementById('redeem-content-selector');
    const contentSelect = document.getElementById('redeem-content-select');
    
    const code = codeInput.value.trim();
    const email = emailInput.value.trim();
    const selectedContent = contentSelector.style.display !== 'none' ? contentSelect.value : null;

    try {
        const result = await apiRequest('/api/redeem', {
            method: 'POST',
            body: JSON.stringify({ code, email, selectedContent })
        });

        showMessage('redeem-message', result.message, 'success');
        codeInput.value = '';
        emailInput.value = '';
        contentSelector.style.display = 'none';
        contentSelect.innerHTML = '';
        currentRedeemCodeInfo = null;
    } catch (error) {
        // 如果是兑换码无效，尝试解析错误信息
        if (error.message && error.message.includes('无效')) {
            contentSelector.style.display = 'none';
            contentSelect.innerHTML = '';
        }
        showMessage('redeem-message', error.message, 'error');
    }
}

// 检查并显示VIP状态（用于左侧VIP卡片）
async function checkAndShowVipStatus(email) {
    try {
        const result = await apiRequest(`/api/vip/check?email=${encodeURIComponent(email)}`);
        const vipStatusEl = document.getElementById('vip-status-info');
        const vipStatusText = vipStatusEl?.querySelector('.vip-status-text');
        
        if (!vipStatusEl || !vipStatusText) return;
        
        if (result.isVip) {
            const expiryDate = new Date(result.expiryDate);
            const now = new Date();
            const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysLeft > 0) {
                vipStatusText.textContent = `${result.level} · 剩余 ${daysLeft} 天`;
                vipStatusText.className = 'vip-status-text active';
            } else {
                vipStatusText.textContent = '已过期';
                vipStatusText.className = 'vip-status-text expired';
            }
        } else {
            vipStatusText.textContent = '未开通';
            vipStatusText.className = 'vip-status-text';
        }
    } catch (error) {
        console.error('检查VIP状态失败:', error);
    }
}

// 生成客户端ID（用于真实在线人数统计）
function getClientId() {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
        clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('clientId', clientId);
    }
    return clientId;
}

// 发送ping请求（记录真实在线人数）
async function pingOnlineCount() {
    try {
        const clientId = getClientId();
        await apiRequest('/api/online-count/ping', {
            method: 'POST',
            body: JSON.stringify({ clientId })
        });
    } catch (error) {
        // 静默失败，不影响用户体验
        console.error('发送在线人数ping失败:', error);
    }
}

// 加载在线人数
async function loadOnlineCount() {
    try {
        const result = await apiRequest('/api/online-count');
        const onlineCountEl = document.getElementById('online-count-text');
        if (onlineCountEl) {
            onlineCountEl.textContent = `在线人数：${result.count || 0}`;
        }
    } catch (error) {
        console.error('加载在线人数失败:', error);
        const onlineCountEl = document.getElementById('online-count-text');
        if (onlineCountEl) {
            onlineCountEl.textContent = '在线人数：--';
        }
    }
}

// 定期更新在线人数
function startOnlineCountUpdate() {
    // 立即发送ping和加载人数
    pingOnlineCount();
    loadOnlineCount();
    
    // 每30秒更新一次在线人数显示
    setInterval(loadOnlineCount, 30000);
    
    // 每60秒发送一次ping（记录真实在线）
    setInterval(pingOnlineCount, 60000);
}

// ==================== 勋章系统 ====================

// 加载用户勋章
async function loadUserBadges(email) {
    try {
        const result = await apiRequest(`/api/badges/user?email=${encodeURIComponent(email)}`);
        const container = document.getElementById('badges-container');
        if (!container) return;

        if (result.badges && result.badges.length > 0) {
            container.innerHTML = result.badges.map(badge => `
                <div class="badge-item" data-badge-name="${badge.name || badge.id}" title="${badge.description || ''}">
                    ${badge.icon || '🏆'}
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="empty-badges">暂无勋章</p>';
        }
    } catch (error) {
        console.error('加载用户勋章失败:', error);
    }
}

// ==================== 等级系统 ====================

// 加载用户等级
async function loadUserLevel(email) {
    try {
        const result = await apiRequest(`/api/level/user?email=${encodeURIComponent(email)}`);
        const levelEl = document.getElementById('user-level');
        const currentExpEl = document.getElementById('current-exp');
        const nextLevelExpEl = document.getElementById('next-level-exp');
        const expProgressEl = document.getElementById('exp-progress');
        const checkinBtn = document.getElementById('checkin-btn');

        // 获取等级配置以显示等级名称
        let levelTitle = `Lv.${result.level || 1}`;
        try {
            const levelConfig = await apiRequest('/api/level-config');
            if (levelConfig.levels && levelConfig.levels.length > 0) {
                const currentLevelData = levelConfig.levels.find(l => l.level === (result.level || 1));
                if (currentLevelData && currentLevelData.title) {
                    levelTitle = `${currentLevelData.badge || ''} ${currentLevelData.title}`;
                }
            }
        } catch (e) {
            // 忽略错误，使用默认显示
        }

        if (levelEl) {
            levelEl.textContent = levelTitle;
        }
        if (currentExpEl) {
            currentExpEl.textContent = result.exp || 0;
        }
        if (nextLevelExpEl) {
            nextLevelExpEl.textContent = result.nextLevelExp || 100;
        }
        if (expProgressEl) {
            const progress = result.nextLevelExp > 0 
                ? ((result.exp || 0) / result.nextLevelExp * 100) 
                : 0;
            expProgressEl.style.width = `${Math.min(progress, 100)}%`;
        }

        // 检查是否可以签到（需要检查今天是否已签到）
        if (checkinBtn) {
            checkinBtn.disabled = false;
            checkinBtn.querySelector('.btn-text').textContent = '立即签到';
        }
    } catch (error) {
        console.error('加载用户等级失败:', error);
    }
}

// 处理签到
async function handleCheckin() {
    const profile = await apiRequest('/api/profile').catch(() => ({}));
    if (!profile.email) {
        showMessage('checkin-message', '请先设置邮箱', 'error');
        return;
    }

    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
        checkinBtn.disabled = true;
        checkinBtn.querySelector('.btn-text').textContent = '签到中...';
    }

    try {
        const result = await apiRequest('/api/level/checkin', {
            method: 'POST',
            body: JSON.stringify({ email: profile.email })
        });

        const messageEl = document.getElementById('checkin-message');
        if (messageEl) {
            messageEl.textContent = result.message;
            messageEl.className = 'checkin-message success';
            messageEl.style.display = 'block';
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 3000);
        }

        // 重新加载等级信息
        await loadUserLevel(profile.email);

        // 更新按钮状态
        if (checkinBtn) {
            checkinBtn.disabled = true;
            checkinBtn.querySelector('.btn-text').textContent = '今日已签到';
        }
    } catch (error) {
        const messageEl = document.getElementById('checkin-message');
        if (messageEl) {
            messageEl.textContent = error.message || '签到失败';
            messageEl.className = 'checkin-message error';
            messageEl.style.display = 'block';
            setTimeout(() => {
                messageEl.style.display = 'none';
            }, 3000);
        }

        if (checkinBtn) {
            checkinBtn.disabled = false;
            checkinBtn.querySelector('.btn-text').textContent = '立即签到';
        }
    }
}

// ==================== 时间线系统 ====================

// 加载时间线事件
async function loadTimeline() {
    try {
        const result = await apiRequest('/api/timeline');
        const container = document.getElementById('timeline-container');
        if (!container) return;

        if (result.events && result.events.length > 0) {
            container.innerHTML = result.events.map(event => `
                <div class="timeline-item">
                    <div class="timeline-item-date">${formatDate(event.date)}</div>
                    <div class="timeline-item-content">${event.content}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="empty-timeline">暂无事件</p>';
        }
    } catch (error) {
        console.error('加载时间线失败:', error);
    }
}

// ==================== 实时通知系统 ====================

let notificationConfig = {
    enabled: true,
    showLevelUp: true,
    showRareBadge: true,
    displayDuration: 5000
};

let lastNotificationId = null;
let notificationCheckInterval = null;

// 加载通知配置
async function loadNotificationConfig() {
    try {
        const config = await apiRequest('/api/notification-config');
        notificationConfig = config;
    } catch (error) {
        console.error('加载通知配置失败:', error);
    }
}

// 显示通知
function showNotification(notification) {
    if (!notificationConfig.enabled) return;
    
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    // 根据通知类型过滤
    if (notification.type === 'levelup' && !notificationConfig.showLevelUp) return;
    if (notification.type === 'badge' && !notificationConfig.showRareBadge) return;
    
    const notificationEl = document.createElement('div');
    notificationEl.className = `notification-item ${notification.type}`;
    
    let icon = '🎉';
    let title = '';
    let message = '';
    
    if (notification.type === 'levelup') {
        icon = '⭐';
        const levelData = notification.levelConfig?.levels?.find(l => l.level === notification.level);
        const levelTitle = levelData?.title || `Lv.${notification.level}`;
        const levelBadge = levelData?.badge || '⭐';
        const userName = notification.virtualName || notification.email?.split('@')[0] || '用户';
        
        title = `<span class="notification-badge">${levelBadge} ${levelTitle}</span>`;
        message = `恭喜 ${userName} 升级了！`;
    } else if (notification.type === 'badge') {
        icon = notification.badgeIcon || '🏆';
        const userName = notification.virtualName || notification.email?.split('@')[0] || '用户';
        
        title = `<span class="notification-badge" style="background: ${notification.badgeColor || '#FFD700'}20; color: ${notification.badgeColor || '#FFD700'}; border: 1px solid ${notification.badgeColor || '#FFD700'}40;">${notification.badgeIcon} ${notification.badgeName}</span>`;
        message = `${userName} 获得了稀有勋章！`;
    }
    
    notificationEl.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    
    // 点击关闭通知
    notificationEl.addEventListener('click', () => {
        notificationEl.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            notificationEl.remove();
        }, 300);
    });
    
    container.appendChild(notificationEl);
    
    // 自动移除通知
    const duration = notificationConfig.displayDuration || 5000;
    setTimeout(() => {
        if (notificationEl.parentElement) {
            notificationEl.remove();
        }
    }, duration);
}

// 检查新通知
async function checkNewNotifications() {
    try {
        const result = await apiRequest('/api/notifications?limit=10');
        const notifications = result.notifications || [];
        
        if (notifications.length === 0) return;
        
        // 获取最新的通知
        const latestNotification = notifications[0];
        
        // 如果是新通知，显示它
        if (!lastNotificationId || latestNotification.id !== lastNotificationId) {
            // 显示所有新通知（从旧到新）
            const newNotifications = [];
            for (const notification of notifications.reverse()) {
                if (!lastNotificationId || notification.id > lastNotificationId) {
                    newNotifications.push(notification);
                }
            }
            
            // 限制一次最多显示3条
            const toShow = newNotifications.slice(-3);
            for (let i = 0; i < toShow.length; i++) {
                setTimeout(() => {
                    showNotification(toShow[i]);
                }, i * 500); // 每条通知间隔500ms
            }
            
            lastNotificationId = latestNotification.id;
        }
    } catch (error) {
        console.error('检查新通知失败:', error);
    }
}

// 启动通知检查
function startNotificationCheck() {
    // 立即检查一次
    checkNewNotifications();
    
    // 每10秒检查一次新通知
    notificationCheckInterval = setInterval(checkNewNotifications, 10000);
}

// 停止通知检查
function stopNotificationCheck() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }
}

// ==================== 左侧兑换码处理 ====================

// 左侧兑换码提交
async function handleRedeemSubmitSidebar(e) {
    e.preventDefault();
    
    const codeInput = document.getElementById('redeem-code-sidebar');
    const emailInput = document.getElementById('redeem-email-sidebar');
    const contentSelector = document.getElementById('redeem-content-selector-sidebar');
    const contentSelect = document.getElementById('redeem-content-select-sidebar');
    
    const code = codeInput.value.trim();
    const email = emailInput.value.trim();
    const selectedContent = contentSelector.style.display !== 'none' ? contentSelect.value : null;

    try {
        const result = await apiRequest('/api/redeem', {
            method: 'POST',
            body: JSON.stringify({ code, email, selectedContent })
        });

        showMessage('redeem-message-sidebar', result.message, 'success');
        codeInput.value = '';
        emailInput.value = '';
        contentSelector.style.display = 'none';
        contentSelect.innerHTML = '';
        currentRedeemCodeInfo = null;

        // 重新加载用户信息（可能获得了VIP或认证）
        await loadProfile();
    } catch (error) {
        if (error.message && error.message.includes('无效')) {
            contentSelector.style.display = 'none';
            contentSelect.innerHTML = '';
        }
        showMessage('redeem-message-sidebar', error.message, 'error');
    }
}

// ==================== 管理后台功能 ====================

// 登录处理
async function handleLogin(e) {
    e.preventDefault();
    console.log('🔐 登录函数被调用');
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    console.log('📝 用户名:', username);

    try {
        // 创建 Basic Auth token
        authToken = 'Basic ' + btoa(`${username}:${password}`);
        
        await apiRequest('/api/admin/login', {
            method: 'POST',
            headers: {
                'Authorization': authToken
            }
        });

        // 保存 token
        sessionStorage.setItem('authToken', authToken);
        
        // 切换到管理页面
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('admin-page').style.display = 'flex';
        
        // 加载管理数据
        loadAdminData();
    } catch (error) {
        showMessage('login-message', error.message || '登录失败', 'error');
        authToken = null;
    }
}

// 退出登录
function handleLogout() {
    authToken = null;
    sessionStorage.removeItem('authToken');
    
    document.getElementById('admin-page').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
}

// 切换侧边栏菜单
function switchSection(sectionName) {
    // 移除所有活动状态
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // 激活选中的部分
    const section = document.getElementById(`${sectionName}-section`);
    if (section) {
        section.classList.add('active');
    }

    const navItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // 更新标题
    const titles = {
        'profile': '个人资料',
        'announcement': '公告管理',
        'portals': '门户管理',
        'advertisements': '广告位管理',
        'redeem-codes': '兑换码管理',
        'vip-users': 'VIP 用户',
        'verified-users': '金V认证',
        'online-count': '人气设置',
        'badges': '勋章管理',
        'user-levels': '等级管理',
        'timeline': '时间线管理',
        'fish-tank': '鱼缸设置',
        'notifications': '实时通知',
        'game-config': '游戏配置',
        'settings': '系统设置'
    };

    const titleEl = document.getElementById('page-title');
    if (titleEl) {
        titleEl.textContent = titles[sectionName] || '管理后台';
    }
}

// 加载管理数据
async function loadAdminData() {
    await loadAdminProfile();
    await loadAdminAnnouncement();
    await loadAdminPortals();
    await loadAdminAdvertisements();
    await loadAdminPopupAd();
    await loadRedeemCodes();
    await loadVipUsers();
    await loadVerifiedUsers();
    await loadOnlineCountConfig();
    await loadBadges();
    await loadUserLevels();
    await loadLevelConfig();
    await loadTimelineEvents();
    await loadFishTankConfig();
    await loadNotificationConfigAdmin();
    await loadNotificationsAdmin();
    await loadGameConfig();
    await loadGameStats();
}

// 加载管理员个人资料
async function loadAdminProfile() {
    try {
        const profile = await apiRequest('/api/profile');
        
        document.getElementById('profile-name').value = profile.name || '';
        document.getElementById('profile-email').value = profile.email || '';
        document.getElementById('profile-avatar').value = profile.avatar || '';
        document.getElementById('profile-bio').value = profile.bio || '';
        document.getElementById('profile-github').value = profile.github || '';
        document.getElementById('profile-twitter').value = profile.twitter || '';
        document.getElementById('profile-website').value = profile.website || '';
    } catch (error) {
        console.error('加载个人资料失败:', error);
    }
}

// 保存个人资料
async function handleProfileSubmit(e) {
    e.preventDefault();
    
    const profile = {
        name: document.getElementById('profile-name').value.trim(),
        email: document.getElementById('profile-email').value.trim(),
        avatar: document.getElementById('profile-avatar').value.trim(),
        bio: document.getElementById('profile-bio').value.trim(),
        github: document.getElementById('profile-github').value.trim(),
        twitter: document.getElementById('profile-twitter').value.trim(),
        website: document.getElementById('profile-website').value.trim()
    };

    try {
        await apiRequest('/api/profile', {
            method: 'PUT',
            body: JSON.stringify(profile)
        });

        showMessage('profile-message', '个人资料保存成功！', 'success');
    } catch (error) {
        showMessage('profile-message', error.message, 'error');
    }
}

// 加载管理员公告
async function loadAdminAnnouncement() {
    try {
        const announcement = await apiRequest('/api/announcement');
        
        document.getElementById('announcement-title').value = announcement.title || '';
        document.getElementById('announcement-content').value = announcement.content || '';
        document.getElementById('announcement-enabled').checked = announcement.enabled || false;
    } catch (error) {
        console.error('加载公告失败:', error);
    }
}

// 保存公告
async function handleAnnouncementSubmit(e) {
    e.preventDefault();
    
    const announcement = {
        title: document.getElementById('announcement-title').value.trim(),
        content: document.getElementById('announcement-content').value.trim(),
        enabled: document.getElementById('announcement-enabled').checked
    };

    try {
        await apiRequest('/api/announcement', {
            method: 'PUT',
            body: JSON.stringify(announcement)
        });

        showMessage('announcement-message', '公告保存成功！', 'success');
    } catch (error) {
        showMessage('announcement-message', error.message, 'error');
    }
}

// 加载管理员门户列表
async function loadAdminPortals() {
    try {
        currentPortals = await apiRequest('/api/admin/portals');
        renderPortalsList();
    } catch (error) {
        console.error('加载门户列表失败:', error);
    }
}

// 渲染门户列表
function renderPortalsList() {
    const container = document.getElementById('portals-list');
    if (!container) return;

    if (currentPortals.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无门户链接</p></div>';
        return;
    }

    container.innerHTML = currentPortals.map((portal, index) => `
        <div class="item-card">
            <div class="item-icon">${portal.icon || '🔗'}</div>
            <div class="item-info">
                <div class="item-name">${portal.name}</div>
                <div class="item-url">${portal.url}</div>
                <div class="item-desc">${portal.description || ''}</div>
            </div>
            <span class="item-badge ${portal.enabled ? 'enabled' : 'disabled'}">
                ${portal.enabled ? '启用' : '禁用'}
            </span>
            <div class="item-actions">
                <button class="btn-secondary" onclick="editPortal(${index})">编辑</button>
                <button class="btn-danger" onclick="deletePortal(${index})">删除</button>
            </div>
        </div>
    `).join('');
}

// 打开门户编辑弹窗
function openPortalModal(portal = null, index = null) {
    const modal = document.getElementById('portal-modal');
    const form = document.getElementById('portal-form');
    const title = document.getElementById('portal-modal-title');
    
    if (portal) {
        title.textContent = '编辑门户';
        document.getElementById('portal-id').value = index;
        document.getElementById('portal-name').value = portal.name;
        document.getElementById('portal-url').value = portal.url;
        document.getElementById('portal-icon').value = portal.icon;
        document.getElementById('portal-description').value = portal.description || '';
        document.getElementById('portal-tags').value = portal.tags ? portal.tags.join(',') : '';
        document.getElementById('portal-enabled').checked = portal.enabled;
        document.getElementById('portal-pinned').checked = portal.pinned || false;
    } else {
        title.textContent = '添加门户';
        form.reset();
        document.getElementById('portal-id').value = '';
        document.getElementById('portal-enabled').checked = true;
    }
    
    modal.style.display = 'flex';
}

function closePortalModal() {
    const modal = document.getElementById('portal-modal');
    modal.style.display = 'none';
}

function editPortal(index) {
    openPortalModal(currentPortals[index], index);
}

async function deletePortal(index) {
    if (!confirm('确定要删除这个门户吗？')) return;
    
    currentPortals.splice(index, 1);
    await savePortals();
}

// 保存门户
async function handlePortalSubmit(e) {
    e.preventDefault();
    
    const index = document.getElementById('portal-id').value;
    const tagsInput = document.getElementById('portal-tags').value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    
    const portal = {
        id: index || Date.now().toString(),
        name: document.getElementById('portal-name').value.trim(),
        url: document.getElementById('portal-url').value.trim(),
        icon: document.getElementById('portal-icon').value.trim(),
        description: document.getElementById('portal-description').value.trim(),
        tags: tags,
        enabled: document.getElementById('portal-enabled').checked,
        pinned: document.getElementById('portal-pinned') ? document.getElementById('portal-pinned').checked : false
    };

    if (index !== '') {
        currentPortals[parseInt(index)] = portal;
    } else {
        currentPortals.push(portal);
    }

    await savePortals();
    closePortalModal();
}

async function savePortals() {
    try {
        await apiRequest('/api/portals', {
            method: 'PUT',
            body: JSON.stringify(currentPortals)
        });

        showMessage('portals-message', '门户列表保存成功！', 'success');
        renderPortalsList();
    } catch (error) {
        showMessage('portals-message', error.message, 'error');
    }
}

// 广告位管理
async function loadAdminAdvertisements() {
    try {
        currentAdvertisements = await apiRequest('/api/admin/advertisements');
        renderAdvertisementsList();
    } catch (error) {
        console.error('加载广告位列表失败:', error);
    }
}

// 渲染广告位列表
function renderAdvertisementsList() {
    const container = document.getElementById('advertisements-list');
    if (!container) return;

    if (currentAdvertisements.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无广告位</p></div>';
        return;
    }

    container.innerHTML = currentAdvertisements.map((ad, index) => `
        <div class="item-card">
            <div class="item-icon">${ad.icon || '📢'}</div>
            <div class="item-info">
                <div class="item-name">${ad.title || '无标题'}</div>
                <div class="item-url">${ad.link || '无链接'}</div>
                <div class="item-desc">${ad.description || ''}</div>
                ${ad.image ? `<div class="item-desc" style="margin-top: 5px;"><small>图片: ${ad.image}</small></div>` : ''}
                <div class="item-desc" style="margin-top: 5px;"><small>排序: ${ad.order || 0}</small></div>
            </div>
            <span class="item-badge ${ad.enabled ? 'enabled' : 'disabled'}">
                ${ad.enabled ? '启用' : '禁用'}
            </span>
            <div class="item-actions">
                <button class="btn-secondary" onclick="editAdvertisement(${index})">编辑</button>
                <button class="btn-danger" onclick="deleteAdvertisement(${index})">删除</button>
            </div>
        </div>
    `).join('');
}

// 打开广告位编辑弹窗
function openAdvertisementModal(ad = null, index = null) {
    const modal = document.getElementById('advertisement-modal');
    const form = document.getElementById('advertisement-form');
    const title = document.getElementById('advertisement-modal-title');
    
    if (ad) {
        title.textContent = '编辑广告位';
        document.getElementById('advertisement-id').value = index;
        document.getElementById('advertisement-title').value = ad.title || '';
        document.getElementById('advertisement-description').value = ad.description || '';
        document.getElementById('advertisement-link').value = ad.link || '';
        document.getElementById('advertisement-image').value = ad.image || '';
        document.getElementById('advertisement-icon').value = ad.icon || '📢';
        document.getElementById('advertisement-order').value = ad.order || 0;
        document.getElementById('advertisement-enabled').checked = ad.enabled !== false;
    } else {
        title.textContent = '添加广告位';
        form.reset();
        document.getElementById('advertisement-id').value = '';
        document.getElementById('advertisement-icon').value = '📢';
        document.getElementById('advertisement-order').value = 0;
        document.getElementById('advertisement-enabled').checked = true;
    }
    
    modal.style.display = 'flex';
}

function closeAdvertisementModal() {
    const modal = document.getElementById('advertisement-modal');
    modal.style.display = 'none';
}

function editAdvertisement(index) {
    openAdvertisementModal(currentAdvertisements[index], index);
}

async function deleteAdvertisement(index) {
    if (!confirm('确定要删除这个广告位吗？')) return;
    
    currentAdvertisements.splice(index, 1);
    await saveAdvertisements();
}

// 保存广告位
async function handleAdvertisementSubmit(e) {
    e.preventDefault();
    
    try {
        const index = document.getElementById('advertisement-id').value;
        const link = document.getElementById('advertisement-link').value.trim();
        
        // 验证必填字段
        if (!link) {
            showMessage('advertisements-message', '链接是必填项，请填写', 'error');
            return;
        }
        
        const advertisement = {
            id: index !== '' ? currentAdvertisements[parseInt(index)].id : Date.now().toString(),
            title: document.getElementById('advertisement-title').value.trim(),
            description: document.getElementById('advertisement-description').value.trim(),
            link: link,
            image: document.getElementById('advertisement-image').value.trim(),
            icon: document.getElementById('advertisement-icon').value.trim() || '📢',
            order: parseInt(document.getElementById('advertisement-order').value) || 0,
            enabled: document.getElementById('advertisement-enabled').checked
        };

        if (index !== '') {
            currentAdvertisements[parseInt(index)] = advertisement;
        } else {
            currentAdvertisements.push(advertisement);
        }

        await saveAdvertisements();
        closeAdvertisementModal();
    } catch (error) {
        console.error('保存广告位失败:', error);
        showMessage('advertisements-message', error.message || '保存失败，请重试', 'error');
    }
}

async function saveAdvertisements() {
    try {
        const result = await apiRequest('/api/admin/advertisements', {
            method: 'PUT',
            body: JSON.stringify(currentAdvertisements)
        });

        showMessage('advertisements-message', result.message || '广告位列表保存成功！', 'success');
        renderAdvertisementsList();
    } catch (error) {
        console.error('保存广告位失败:', error);
        const errorMsg = error.message || '保存失败，请检查网络连接或稍后重试';
        showMessage('advertisements-message', errorMsg, 'error');
    }
}

// 弹窗广告管理
async function loadAdminPopupAd() {
    try {
        const popupAd = await apiRequest('/api/admin/popup-ad');
        document.getElementById('popup-ad-enabled').checked = popupAd.enabled || false;
        document.getElementById('popup-ad-frequency').value = popupAd.frequency || 'daily';
        document.getElementById('popup-ad-content').value = popupAd.content || '';
    } catch (error) {
        console.error('加载弹窗广告失败:', error);
    }
}

async function handlePopupAdSubmit(e) {
    e.preventDefault();
    
    const popupAd = {
        id: Date.now().toString(),
        enabled: document.getElementById('popup-ad-enabled').checked,
        frequency: document.getElementById('popup-ad-frequency').value,
        content: document.getElementById('popup-ad-content').value.trim()
    };

    try {
        await apiRequest('/api/admin/popup-ad', {
            method: 'PUT',
            body: JSON.stringify(popupAd)
        });

        showMessage('popup-ad-message', '弹窗广告保存成功！', 'success');
    } catch (error) {
        showMessage('popup-ad-message', error.message, 'error');
    }
}

// 兑换码管理
async function loadRedeemCodes() {
    try {
        const codes = await apiRequest('/api/admin/redeem-codes');
        renderRedeemCodes(codes);
    } catch (error) {
        console.error('加载兑换码失败:', error);
    }
}

function renderRedeemCodes(codes) {
    const tbody = document.getElementById('codes-tbody');
    if (!tbody) return;

    if (codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-text">暂无兑换码</td></tr>';
        return;
    }

    tbody.innerHTML = codes.map(code => `
        <tr>
            <td><code>${code.code}</code></td>
            <td>${code.type}</td>
            <td>${code.value}</td>
            <td><span class="status-badge ${code.used ? 'used' : 'unused'}">${code.used ? '已使用' : '未使用'}</span></td>
            <td>${code.usedBy || '-'}</td>
            <td>${formatDate(code.createdAt)}</td>
            <td>
                <button class="btn-danger" onclick="deleteRedeemCode('${code.code}')">删除</button>
            </td>
        </tr>
    `).join('');
}

function openGenerateCodeModal() {
    const modal = document.getElementById('generate-code-modal');
    const form = document.getElementById('generate-code-form');
    form.reset();
    updateCodeTypeOptions(); // 初始化选项显示
    modal.style.display = 'flex';
}

function closeGenerateCodeModal() {
    const modal = document.getElementById('generate-code-modal');
    modal.style.display = 'none';
}

// 更新兑换码类型选项
function updateCodeTypeOptions() {
    const type = document.getElementById('code-type').value;
    const availableContentsGroup = document.getElementById('available-contents-group');
    const documentContentGroup = document.getElementById('document-content-group');
    
    if (type === 'document') {
        documentContentGroup.style.display = 'block';
        availableContentsGroup.style.display = 'none';
    } else if (type === 'vip' || type === 'verified') {
        availableContentsGroup.style.display = 'block';
        documentContentGroup.style.display = 'none';
    } else {
        availableContentsGroup.style.display = 'none';
        documentContentGroup.style.display = 'none';
    }
}

async function handleGenerateCodeSubmit(e) {
    e.preventDefault();
    
    const type = document.getElementById('code-type').value;
    const availableContentsText = document.getElementById('available-contents').value.trim();
    const availableContents = availableContentsText ? availableContentsText.split('\n').filter(line => line.trim()) : [];
    const documentContent = document.getElementById('document-content').value.trim();
    
    const data = {
        type: type,
        value: document.getElementById('code-value').value.trim(),
        count: parseInt(document.getElementById('code-count').value),
        description: document.getElementById('code-description').value.trim(),
        availableContents: availableContents,
        documentContent: documentContent
    };

    try {
        const result = await apiRequest('/api/admin/redeem-codes', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('codes-message', result.message, 'success');
        closeGenerateCodeModal();
        loadRedeemCodes();
    } catch (error) {
        showMessage('codes-message', error.message, 'error');
    }
}

async function deleteRedeemCode(code) {
    if (!confirm('确定要删除这个兑换码吗？')) return;
    
    try {
        await apiRequest('/api/admin/redeem-codes', {
            method: 'DELETE',
            body: JSON.stringify({ code })
        });

        showMessage('codes-message', '兑换码删除成功！', 'success');
        loadRedeemCodes();
    } catch (error) {
        showMessage('codes-message', error.message, 'error');
    }
}

// VIP 用户管理
async function loadVipUsers() {
    try {
        const users = await apiRequest('/api/admin/vip-users');
        renderVipUsers(users);
    } catch (error) {
        console.error('加载 VIP 用户失败:', error);
    }
}

function renderVipUsers(users) {
    const tbody = document.getElementById('vip-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state-text">暂无 VIP 用户</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td><span class="status-badge enabled">${user.level}</span></td>
            <td>${formatDate(user.expiryDate)}</td>
            <td>${formatDate(user.createdAt)}</td>
            <td>
                <button class="btn-danger" onclick="deleteVipUser('${user.email}')">删除</button>
            </td>
        </tr>
    `).join('');
}

function openAddVipModal() {
    const modal = document.getElementById('add-vip-modal');
    const form = document.getElementById('add-vip-form');
    form.reset();
    modal.style.display = 'flex';
}

function closeAddVipModal() {
    const modal = document.getElementById('add-vip-modal');
    modal.style.display = 'none';
}

async function handleAddVipSubmit(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('vip-email').value.trim(),
        level: document.getElementById('vip-level').value,
        days: parseInt(document.getElementById('vip-days').value)
    };

    try {
        await apiRequest('/api/admin/vip-users', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('vip-message', 'VIP 用户添加成功！', 'success');
        closeAddVipModal();
        loadVipUsers();
    } catch (error) {
        showMessage('vip-message', error.message, 'error');
    }
}

async function deleteVipUser(email) {
    if (!confirm('确定要删除这个 VIP 用户吗？')) return;
    
    try {
        await apiRequest('/api/admin/vip-users', {
            method: 'DELETE',
            body: JSON.stringify({ email })
        });

        showMessage('vip-message', 'VIP 用户删除成功！', 'success');
        loadVipUsers();
    } catch (error) {
        showMessage('vip-message', error.message, 'error');
    }
}

// 金V认证管理
async function loadVerifiedUsers() {
    try {
        const users = await apiRequest('/api/admin/verified-users');
        renderVerifiedUsers(users);
    } catch (error) {
        console.error('加载认证用户失败:', error);
    }
}

function renderVerifiedUsers(users) {
    const tbody = document.getElementById('verified-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state-text">暂无认证用户</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${user.name}</td>
            <td>${formatDate(user.verifiedAt)}</td>
            <td>
                <button class="btn-danger" onclick="deleteVerifiedUser('${user.email}')">删除</button>
            </td>
        </tr>
    `).join('');
}

function openAddVerifiedModal() {
    const modal = document.getElementById('add-verified-modal');
    const form = document.getElementById('add-verified-form');
    form.reset();
    modal.style.display = 'flex';
}

function closeAddVerifiedModal() {
    const modal = document.getElementById('add-verified-modal');
    modal.style.display = 'none';
}

async function handleAddVerifiedSubmit(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('verified-email').value.trim(),
        name: document.getElementById('verified-name').value.trim()
    };

    try {
        await apiRequest('/api/admin/verified-users', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('verified-message', '黄V认证添加成功！', 'success');
        closeAddVerifiedModal();
        loadVerifiedUsers();
    } catch (error) {
        showMessage('verified-message', error.message, 'error');
    }
}

async function deleteVerifiedUser(email) {
    if (!confirm('确定要删除这个认证用户吗？')) return;
    
    try {
        await apiRequest('/api/admin/verified-users', {
            method: 'DELETE',
            body: JSON.stringify({ email })
        });

        showMessage('verified-message', '认证用户删除成功！', 'success');
        loadVerifiedUsers();
    } catch (error) {
        showMessage('verified-message', error.message, 'error');
    }
}

// 加载在线人数配置
async function loadOnlineCountConfig() {
    try {
        const config = await apiRequest('/api/admin/online-count-config');
        document.getElementById('real-count-enabled').checked = config.realCountEnabled || false;
        document.getElementById('fake-count-enabled').checked = config.fakeCountEnabled || false;
        document.getElementById('fake-count-base').value = config.fakeCountBase || 200;
        document.getElementById('fake-count-min').value = config.fakeCountMin || 100;
        document.getElementById('fake-count-max').value = config.fakeCountMax || 500;
    } catch (error) {
        console.error('加载在线人数配置失败:', error);
    }
}

// 保存在线人数配置
async function handleOnlineCountSubmit(e) {
    e.preventDefault();
    
    const config = {
        realCountEnabled: document.getElementById('real-count-enabled').checked,
        fakeCountEnabled: document.getElementById('fake-count-enabled').checked,
        fakeCountBase: parseInt(document.getElementById('fake-count-base').value) || 200,
        fakeCountMin: parseInt(document.getElementById('fake-count-min').value) || 100,
        fakeCountMax: parseInt(document.getElementById('fake-count-max').value) || 500
    };

    if (config.fakeCountMin < 0 || config.fakeCountMax < 0 || config.fakeCountBase < 0) {
        showMessage('online-count-message', '配置值不能为负数！', 'error');
        return;
    }

    if (config.fakeCountMin > config.fakeCountMax) {
        showMessage('online-count-message', '最小值不能大于最大值！', 'error');
        return;
    }

    try {
        await apiRequest('/api/admin/online-count-config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });

        showMessage('online-count-message', '在线人数配置保存成功！', 'success');
    } catch (error) {
        showMessage('online-count-message', error.message, 'error');
    }
}

// 修改密码
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showMessage('password-message', '两次输入的新密码不一致！', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showMessage('password-message', '新密码长度至少为 6 位！', 'error');
        return;
    }

    try {
        await apiRequest('/api/admin/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });

        showMessage('password-message', '密码修改成功！请重新登录。', 'success');
        
        setTimeout(() => {
            handleLogout();
        }, 2000);
    } catch (error) {
        showMessage('password-message', error.message, 'error');
    }
}

// ==================== 勋章管理 ====================

let currentBadgeDefinitions = {};

async function loadBadges() {
    try {
        const userBadges = await apiRequest('/api/admin/user-badges');
        renderBadges(userBadges);
        // 同时加载勋章定义
        await loadBadgeDefinitions();
    } catch (error) {
        console.error('加载勋章失败:', error);
        renderBadges([]);
    }
}

async function loadBadgeDefinitions() {
    try {
        currentBadgeDefinitions = await apiRequest('/api/admin/badges');
        // 确保返回的是对象
        if (!currentBadgeDefinitions || typeof currentBadgeDefinitions !== 'object') {
            currentBadgeDefinitions = {};
        }
        console.log('加载的勋章定义:', currentBadgeDefinitions);
        console.log('勋章数量:', Object.keys(currentBadgeDefinitions).length);
        renderBadgeDefinitions(currentBadgeDefinitions);
        // 更新授予勋章的选项
        updateGrantBadgeOptions(currentBadgeDefinitions);
    } catch (error) {
        console.error('加载勋章定义失败:', error);
        currentBadgeDefinitions = {};
        updateGrantBadgeOptions({});
    }
}

function renderBadgeDefinitions(badges) {
    const container = document.getElementById('badge-definitions-list');
    if (!container) return;

    const badgeKeys = Object.keys(badges);
    if (badgeKeys.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无勋章定义，点击"添加勋章"按钮创建</p></div>';
        return;
    }

    container.innerHTML = badgeKeys.map(badgeId => {
        const badge = badges[badgeId];
        return `
            <div class="item-card">
                <div class="item-icon">${badge.icon || '🏆'}</div>
                <div class="item-info">
                    <div class="item-name">${badge.name || badgeId} <small style="color: var(--text-muted);">(${badgeId})</small></div>
                    <div class="item-desc">${badge.description || ''}</div>
                    <div class="item-desc" style="margin-top: 5px;">
                        <small>颜色: <span style="color: ${badge.color || '#FFD700'}">${badge.color || '#FFD700'}</span></small>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-secondary" onclick="editBadgeDefinition('${badgeId}')">编辑</button>
                    <button class="btn-danger" onclick="deleteBadgeDefinition('${badgeId}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function updateGrantBadgeOptions(badges) {
    const select = document.getElementById('grant-badge-id');
    if (!select) {
        console.warn('未找到grant-badge-id元素');
        return;
    }
    
    const badgeKeys = Object.keys(badges || {});
    console.log('更新勋章选项，数量:', badgeKeys.length);
    
    if (badgeKeys.length === 0) {
        // 如果没有勋章定义，显示提示选项
        select.innerHTML = '<option value="">暂无可用勋章，请先添加勋章定义</option>';
        select.disabled = true;
        return;
    }
    
    select.disabled = false;
    const options = badgeKeys.map(badgeId => {
        const badge = badges[badgeId];
        return `<option value="${badgeId}">${badge.icon || '🏆'} ${badge.name || badgeId}</option>`;
    }).join('');
    select.innerHTML = options;
    console.log('勋章选项已更新:', options);
}

function openAddBadgeDefinitionModal() {
    const modal = document.getElementById('edit-badge-definition-modal');
    const form = document.getElementById('edit-badge-definition-form');
    form.reset();
    
    document.getElementById('edit-badge-id').value = '';
    document.getElementById('edit-badge-id-input').value = '';
    document.getElementById('edit-badge-id-input').disabled = false;
    document.getElementById('edit-badge-id-hint').textContent = '英文标识，例如：emperor、hero等';
    document.getElementById('edit-badge-name').value = '';
    document.getElementById('edit-badge-icon').value = '';
    document.getElementById('edit-badge-color').value = '#FFD700';
    document.getElementById('edit-badge-description').value = '';
    document.getElementById('edit-badge-modal-title').textContent = '添加勋章定义';
    modal.style.display = 'flex';
}

function editBadgeDefinition(badgeId) {
    const badge = currentBadgeDefinitions[badgeId];
    if (!badge) return;

    const modal = document.getElementById('edit-badge-definition-modal');
    const form = document.getElementById('edit-badge-definition-form');
    form.reset();
    
    document.getElementById('edit-badge-id').value = badgeId;
    document.getElementById('edit-badge-id-input').value = badgeId;
    document.getElementById('edit-badge-id-input').disabled = true;
    document.getElementById('edit-badge-id-hint').textContent = '编辑模式下不可修改';
    document.getElementById('edit-badge-name').value = badge.name || '';
    document.getElementById('edit-badge-icon').value = badge.icon || '';
    document.getElementById('edit-badge-color').value = badge.color || '#FFD700';
    document.getElementById('edit-badge-description').value = badge.description || '';
    document.getElementById('edit-badge-modal-title').textContent = '编辑勋章定义';
    modal.style.display = 'flex';
}

function closeEditBadgeDefinitionModal() {
    const modal = document.getElementById('edit-badge-definition-modal');
    modal.style.display = 'none';
}

async function handleEditBadgeDefinitionSubmit(e) {
    e.preventDefault();
    
    const existingBadgeId = document.getElementById('edit-badge-id').value;
    const newBadgeId = document.getElementById('edit-badge-id-input').value.trim();
    const badge = {
        name: document.getElementById('edit-badge-name').value.trim(),
        icon: document.getElementById('edit-badge-icon').value.trim(),
        color: document.getElementById('edit-badge-color').value,
        description: document.getElementById('edit-badge-description').value.trim()
    };

    if (!newBadgeId) {
        showMessage('badge-definitions-message', '请输入勋章ID', 'error');
        return;
    }

    if (!badge.name || !badge.icon) {
        showMessage('badge-definitions-message', '名称和图标不能为空', 'error');
        return;
    }

    // 如果是添加新勋章，检查ID是否已存在
    if (!existingBadgeId && currentBadgeDefinitions[newBadgeId]) {
        showMessage('badge-definitions-message', '该勋章ID已存在，请使用其他ID', 'error');
        return;
    }

    try {
        // 如果是编辑且ID改变了，需要删除旧的
        if (existingBadgeId && existingBadgeId !== newBadgeId) {
            delete currentBadgeDefinitions[existingBadgeId];
        }
        
        currentBadgeDefinitions[newBadgeId] = badge;
        await apiRequest('/api/admin/badges', {
            method: 'PUT',
            body: JSON.stringify(currentBadgeDefinitions)
        });

        showMessage('badge-definitions-message', existingBadgeId ? '勋章定义更新成功！' : '勋章定义添加成功！', 'success');
        closeEditBadgeDefinitionModal();
        await loadBadgeDefinitions();
    } catch (error) {
        showMessage('badge-definitions-message', error.message, 'error');
    }
}

async function deleteBadgeDefinition(badgeId) {
    if (!confirm(`确定要删除勋章"${currentBadgeDefinitions[badgeId]?.name || badgeId}"吗？`)) {
        return;
    }

    try {
        delete currentBadgeDefinitions[badgeId];
        await apiRequest('/api/admin/badges', {
            method: 'PUT',
            body: JSON.stringify(currentBadgeDefinitions)
        });

        showMessage('badge-definitions-message', '勋章定义删除成功！', 'success');
        await loadBadgeDefinitions();
    } catch (error) {
        showMessage('badge-definitions-message', error.message, 'error');
    }
}

function renderBadges(userBadges) {
    const tbody = document.getElementById('badges-tbody');
    if (!tbody) return;

    if (userBadges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state-text">暂无勋章记录，授予勋章后会自动显示</td></tr>';
        return;
    }

    tbody.innerHTML = userBadges.map(ub => `
        <tr>
            <td>${ub.email}</td>
            <td>${ub.badgeName || ub.badgeId}</td>
            <td>${formatDate(ub.grantedAt)}</td>
            <td>
                <button class="btn-danger" onclick="revokeBadge('${ub.email}', '${ub.badgeId}')">移除</button>
            </td>
        </tr>
    `).join('');
}

async function revokeBadge(email, badgeId) {
    if (!confirm('确定要移除这个勋章吗？')) return;
    
    try {
        await apiRequest('/api/admin/badges/revoke', {
            method: 'POST',
            body: JSON.stringify({ email, badgeId })
        });

        showMessage('badges-message', '勋章已移除', 'success');
        loadBadges();
    } catch (error) {
        showMessage('badges-message', error.message, 'error');
    }
}

async function openGrantBadgeModal() {
    const modal = document.getElementById('grant-badge-modal');
    const form = document.getElementById('grant-badge-form');
    form.reset();
    // 确保勋章选项已加载
    if (Object.keys(currentBadgeDefinitions).length === 0) {
        await loadBadgeDefinitions();
    }
    // 再次更新选项，确保下拉框有内容
    updateGrantBadgeOptions(currentBadgeDefinitions);
    modal.style.display = 'flex';
}

function closeGrantBadgeModal() {
    const modal = document.getElementById('grant-badge-modal');
    modal.style.display = 'none';
}

async function handleGrantBadgeSubmit(e) {
    e.preventDefault();
    
    const badgeId = document.getElementById('grant-badge-id').value;
    if (!badgeId) {
        showMessage('badges-message', '请选择要授予的勋章', 'error');
        return;
    }
    
    const data = {
        email: document.getElementById('grant-badge-email').value.trim(),
        badgeId: badgeId
    };

    if (!data.email) {
        showMessage('badges-message', '请输入邮箱', 'error');
        return;
    }

    try {
        await apiRequest('/api/admin/badges/grant', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('badges-message', '勋章授予成功！', 'success');
        closeGrantBadgeModal();
        loadBadges();
    } catch (error) {
        showMessage('badges-message', error.message, 'error');
    }
}

// ==================== 等级管理 ====================

async function loadUserLevels() {
    try {
        const users = await apiRequest('/api/admin/user-levels');
        renderUserLevels(users);
    } catch (error) {
        console.error('加载用户等级失败:', error);
    }
}

function renderUserLevels(users) {
    const tbody = document.getElementById('user-levels-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-text">暂无用户等级记录</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>Lv.${user.level || 1}</td>
            <td>${user.exp || 0}</td>
            <td>${user.checkinCount || 0}</td>
            <td>${user.lastCheckin ? formatDate(user.lastCheckin) : '-'}</td>
            <td>
                <button class="btn-secondary" onclick="openAddExpModalForUser('${user.email}')">发放经验</button>
            </td>
        </tr>
    `).join('');
}

function openAddExpModal(userEmail = '') {
    const modal = document.getElementById('add-exp-modal');
    const form = document.getElementById('add-exp-form');
    form.reset();
    if (userEmail) {
        document.getElementById('add-exp-email').value = userEmail;
    }
    modal.style.display = 'flex';
}

function openAddExpModalForUser(email) {
    openAddExpModal(email);
}

function closeAddExpModal() {
    const modal = document.getElementById('add-exp-modal');
    modal.style.display = 'none';
}

async function handleAddExpSubmit(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('add-exp-email').value.trim(),
        exp: parseInt(document.getElementById('add-exp-amount').value),
        reason: document.getElementById('add-exp-reason').value.trim()
    };

    try {
        await apiRequest('/api/admin/user-levels/add-exp', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('user-levels-message', `成功发放 ${data.exp} 经验！`, 'success');
        closeAddExpModal();
        loadUserLevels();
    } catch (error) {
        showMessage('user-levels-message', error.message, 'error');
    }
}

async function loadLevelConfig() {
    try {
        const config = await apiRequest('/api/admin/level-config');
        document.getElementById('checkin-exp').value = config.checkinExp || 10;
        // 支持新格式
        if (config.leveling_rule) {
            document.getElementById('leveling-rule-type').value = config.leveling_rule.type || 'cumulative';
        }
        // 兼容旧格式
        if (config.levels && config.levels.length > 0) {
            // 如果是旧格式，转换为新格式
            if (config.levels[0].exp !== undefined && !config.levels[0].required_xp) {
                const newLevels = config.levels.map((level, index) => ({
                    level: level.level,
                    title: level.title || `等级${level.level}`,
                    required_xp: level.exp,
                    color: level.color || '#8A8F98',
                    badge: level.badge || '⭐',
                    privilege_points: level.privilege_points || 0
                }));
                document.getElementById('level-levels').value = JSON.stringify(newLevels, null, 2);
            } else {
                document.getElementById('level-levels').value = JSON.stringify(config.levels, null, 2);
            }
        } else {
            document.getElementById('level-levels').value = JSON.stringify([], null, 2);
        }
    } catch (error) {
        console.error('加载等级配置失败:', error);
    }
}

async function handleLevelConfigSubmit(e) {
    e.preventDefault();
    
    let levels;
    try {
        levels = JSON.parse(document.getElementById('level-levels').value);
    } catch (error) {
        showMessage('level-config-message', '等级配置JSON格式错误！', 'error');
        return;
    }

    const config = {
        checkinExp: parseInt(document.getElementById('checkin-exp').value) || 10,
        leveling_rule: {
            type: document.getElementById('leveling-rule-type').value || 'cumulative',
            note: 'required_xp 为到达该等级的累计经验门槛（>= 即达成）'
        },
        levels: levels
    };

    try {
        await apiRequest('/api/admin/level-config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });

        showMessage('level-config-message', '等级配置保存成功！', 'success');
    } catch (error) {
        showMessage('level-config-message', error.message, 'error');
    }
}

// ==================== 时间线管理 ====================

async function loadTimelineEvents() {
    try {
        const result = await apiRequest('/api/admin/timeline');
        const events = Array.isArray(result) ? result : (result.events || []);
        renderTimelineEvents(events);
    } catch (error) {
        console.error('加载时间线事件失败:', error);
    }
}

function renderTimelineEvents(events) {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    if (events.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无时间线事件</p></div>';
        return;
    }

    container.innerHTML = events.map(event => `
        <div class="item-card">
            <div class="item-info">
                <div class="item-name">${formatDate(event.date)}</div>
                <div class="item-desc">${event.content}</div>
            </div>
            <span class="item-badge ${event.enabled !== false ? 'enabled' : 'disabled'}">
                ${event.enabled !== false ? '启用' : '禁用'}
            </span>
            <div class="item-actions">
                <button class="btn-secondary" onclick="editTimelineEvent('${event.id}')">编辑</button>
                <button class="btn-danger" onclick="deleteTimelineEvent('${event.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function openAddTimelineModal() {
    const modal = document.getElementById('add-timeline-modal');
    const form = document.getElementById('add-timeline-form');
    form.reset();
    document.getElementById('timeline-date').value = new Date().toISOString().split('T')[0];
    modal.style.display = 'flex';
}

function closeAddTimelineModal() {
    const modal = document.getElementById('add-timeline-modal');
    modal.style.display = 'none';
}

async function handleAddTimelineSubmit(e) {
    e.preventDefault();
    
    const data = {
        date: document.getElementById('timeline-date').value,
        content: document.getElementById('timeline-content').value.trim(),
        enabled: document.getElementById('timeline-enabled').checked
    };

    try {
        await apiRequest('/api/admin/timeline', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('timeline-message', '事件添加成功！', 'success');
        closeAddTimelineModal();
        loadTimelineEvents();
    } catch (error) {
        showMessage('timeline-message', error.message, 'error');
    }
}

async function deleteTimelineEvent(id) {
    if (!confirm('确定要删除这个事件吗？')) return;
    
    try {
        await apiRequest('/api/admin/timeline', {
            method: 'DELETE',
            body: JSON.stringify({ id })
        });

        showMessage('timeline-message', '事件删除成功！', 'success');
        loadTimelineEvents();
    } catch (error) {
        showMessage('timeline-message', error.message, 'error');
    }
}

// ==================== 鱼缸设置（管理后台）====================

// 加载鱼缸配置（管理后台专用，使用管理员API）
async function loadFishTankConfig() {
    try {
        const config = await apiRequest('/api/admin/fish-tank-config');
        
        // 更新表单
        const enabledCheckbox = document.getElementById('fish-tank-enabled');
        const minPortalsInput = document.getElementById('fish-tank-min-portals');
        if (enabledCheckbox) enabledCheckbox.checked = config.enabled !== false;
        if (minPortalsInput) minPortalsInput.value = config.minPortalsToHide || 3;
        
        // 更新全局配置
        fishTankConfig = config;
        ensureFishTankConfig();
    } catch (error) {
        console.error('加载鱼缸配置失败:', error);
        // 使用默认值
        ensureFishTankConfig();
    }
}

async function handleFishTankSubmit(e) {
    e.preventDefault();
    
    const config = {
        enabled: document.getElementById('fish-tank-enabled').checked,
        minPortalsToHide: parseInt(document.getElementById('fish-tank-min-portals').value) || 3
    };

    try {
        await apiRequest('/api/admin/fish-tank-config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });

        showMessage('fish-tank-message', '鱼缸设置保存成功！', 'success');
    } catch (error) {
        showMessage('fish-tank-message', error.message, 'error');
    }
}

// ==================== 游戏配置管理（管理后台）====================

// 加载游戏配置
async function loadGameConfig() {
    try {
        const config = await apiRequest('/api/admin/game/config');
        
        document.getElementById('game-enabled').checked = config.enabled !== false;
        document.getElementById('game-max-energy').value = config.maxEnergy || 100;
        document.getElementById('game-energy-recover').value = config.energyRecoverRate || 10;
        document.getElementById('game-daily-events').value = config.dailyEventLimit || 10;
        document.getElementById('game-farm-plots').value = config.farmPlots || 4;
    } catch (error) {
        console.error('加载游戏配置失败:', error);
    }
}

// 保存游戏配置
async function handleGameConfigSubmit(e) {
    e.preventDefault();
    
    const config = {
        enabled: document.getElementById('game-enabled').checked,
        maxEnergy: parseInt(document.getElementById('game-max-energy').value) || 100,
        energyRecoverRate: parseInt(document.getElementById('game-energy-recover').value) || 10,
        dailyEventLimit: parseInt(document.getElementById('game-daily-events').value) || 10,
        farmPlots: parseInt(document.getElementById('game-farm-plots').value) || 4,
        blackDiamondBenefits: {
            energyBonus: 20,
            offlineGrowthSpeed: 1.2,
            protectionShield: 1,
            quickHarvest: true,
            breakProtection: true
        }
    };

    try {
        await apiRequest('/api/admin/game/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });

        showMessage('game-config-message', '游戏配置保存成功！', 'success');
        await loadGameStats(); // 重新加载统计数据
    } catch (error) {
        showMessage('game-config-message', error.message, 'error');
    }
}

// 加载游戏统计
async function loadGameStats() {
    try {
        const stats = await apiRequest('/api/admin/game/stats');
        
        document.getElementById('stat-total-players').textContent = stats.totalPlayers || 0;
        document.getElementById('stat-active-today').textContent = stats.activeToday || 0;
        document.getElementById('stat-total-coins').textContent = (stats.totalCoins || 0).toLocaleString();
        document.getElementById('stat-average-level').textContent = stats.averageLevel || '0.00';
    } catch (error) {
        console.error('加载游戏统计失败:', error);
    }
}

// ==================== 实时通知管理（管理后台）====================

// 加载通知配置（管理后台）
async function loadNotificationConfigAdmin() {
    try {
        const config = await apiRequest('/api/admin/notification-config');
        
        document.getElementById('notification-enabled').checked = config.enabled !== false;
        document.getElementById('notification-show-levelup').checked = config.showLevelUp !== false;
        document.getElementById('notification-show-badge').checked = config.showRareBadge !== false;
        document.getElementById('notification-duration').value = config.displayDuration || 5000;
        document.getElementById('notification-max').value = config.maxNotifications || 50;
        document.getElementById('notification-virtual-enabled').checked = config.virtualDataEnabled || false;
    } catch (error) {
        console.error('加载通知配置失败:', error);
    }
}

// 保存通知配置
async function handleNotificationConfigSubmit(e) {
    e.preventDefault();
    
    const config = {
        enabled: document.getElementById('notification-enabled').checked,
        showLevelUp: document.getElementById('notification-show-levelup').checked,
        showRareBadge: document.getElementById('notification-show-badge').checked,
        displayDuration: parseInt(document.getElementById('notification-duration').value) || 5000,
        maxNotifications: parseInt(document.getElementById('notification-max').value) || 50,
        virtualDataEnabled: document.getElementById('notification-virtual-enabled').checked
    };

    try {
        await apiRequest('/api/admin/notification-config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });

        showMessage('notification-config-message', '通知配置保存成功！', 'success');
    } catch (error) {
        showMessage('notification-config-message', error.message, 'error');
    }
}

// 加载通知列表
async function loadNotificationsAdmin() {
    try {
        const notifications = await apiRequest('/api/admin/notifications');
        renderNotificationsList(notifications);
    } catch (error) {
        console.error('加载通知列表失败:', error);
    }
}

// 渲染通知列表
function renderNotificationsList(notifications) {
    const container = document.getElementById('notifications-list');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无通知记录</p></div>';
        return;
    }

    // 只显示最新的20条
    const recentNotifications = notifications.slice(-20).reverse();
    
    container.innerHTML = recentNotifications.map(notification => {
        const time = formatDate(notification.timestamp);
        const userName = notification.virtualName || notification.email?.split('@')[0] || '用户';
        
        let content = '';
        if (notification.type === 'levelup') {
            const levelData = notification.levelConfig?.levels?.find(l => l.level === notification.level);
            const levelTitle = levelData?.title || `Lv.${notification.level}`;
            const levelBadge = levelData?.badge || '⭐';
            content = `${userName} 升级到 ${levelBadge} ${levelTitle}`;
        } else if (notification.type === 'badge') {
            content = `${userName} 获得勋章 ${notification.badgeIcon} ${notification.badgeName}`;
        }
        
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${content}</div>
                    <div class="item-desc">${time}</div>
                </div>
                <span class="item-badge ${notification.type === 'levelup' ? 'enabled' : 'disabled'}">
                    ${notification.type === 'levelup' ? '升级' : '勋章'}
                </span>
            </div>
        `;
    }).join('');
}

// 生成虚拟通知
async function generateVirtualNotification(type, count) {
    try {
        const result = await apiRequest('/api/admin/notifications/virtual', {
            method: 'POST',
            body: JSON.stringify({ type: type === 'all' ? null : type, count: count })
        });

        showMessage('notification-action-message', result.message, 'success');
        await loadNotificationsAdmin();
    } catch (error) {
        showMessage('notification-action-message', error.message, 'error');
    }
}

// 清空所有通知
async function clearAllNotifications() {
    if (!confirm('确定要清空所有通知记录吗？此操作不可恢复。')) return;
    
    try {
        const result = await apiRequest('/api/admin/notifications', {
            method: 'DELETE'
        });

        showMessage('notification-action-message', result.message, 'success');
        await loadNotificationsAdmin();
    } catch (error) {
        showMessage('notification-action-message', error.message, 'error');
    }
}

// ==================== 页面初始化 ====================

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOMContentLoaded 事件触发');
    // 检查是否在管理页面
    const isAdminPage = document.getElementById('admin-page') !== null;
    const isIndexPage = document.getElementById('portals-container') !== null;
    console.log('🔍 页面类型检测 - 管理页面:', isAdminPage, '首页:', isIndexPage);

    if (isAdminPage) {
        // 管理后台初始化
        const savedToken = sessionStorage.getItem('authToken');
        if (savedToken) {
            authToken = savedToken;
            document.getElementById('login-page').style.display = 'none';
            document.getElementById('admin-page').style.display = 'flex';
            loadAdminData();
        }

        // 登录表单
        const loginForm = document.getElementById('login-form');
        console.log('🔍 查找登录表单:', loginForm);
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
            console.log('✅ 登录表单事件已绑定');
        } else {
            console.error('❌ 未找到登录表单');
        }

        // 退出登录
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // 侧边栏导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.getAttribute('data-section');
                switchSection(section);
            });
        });

        // 表单监听
        const profileForm = document.getElementById('profile-form');
        if (profileForm) profileForm.addEventListener('submit', handleProfileSubmit);

        const announcementForm = document.getElementById('announcement-form');
        if (announcementForm) announcementForm.addEventListener('submit', handleAnnouncementSubmit);

        const portalForm = document.getElementById('portal-form');
        if (portalForm) portalForm.addEventListener('submit', handlePortalSubmit);

        const advertisementForm = document.getElementById('advertisement-form');
        if (advertisementForm) advertisementForm.addEventListener('submit', handleAdvertisementSubmit);

        const popupAdForm = document.getElementById('popup-ad-form');
        if (popupAdForm) popupAdForm.addEventListener('submit', handlePopupAdSubmit);

        const generateCodeForm = document.getElementById('generate-code-form');
        if (generateCodeForm) generateCodeForm.addEventListener('submit', handleGenerateCodeSubmit);

        const addVipForm = document.getElementById('add-vip-form');
        if (addVipForm) addVipForm.addEventListener('submit', handleAddVipSubmit);

        const addVerifiedForm = document.getElementById('add-verified-form');
        if (addVerifiedForm) addVerifiedForm.addEventListener('submit', handleAddVerifiedSubmit);

        const onlineCountForm = document.getElementById('online-count-form');
        if (onlineCountForm) onlineCountForm.addEventListener('submit', handleOnlineCountSubmit);

        const passwordForm = document.getElementById('password-form');
        if (passwordForm) passwordForm.addEventListener('submit', handlePasswordSubmit);

        const grantBadgeForm = document.getElementById('grant-badge-form');
        if (grantBadgeForm) grantBadgeForm.addEventListener('submit', handleGrantBadgeSubmit);

        const addExpForm = document.getElementById('add-exp-form');
        if (addExpForm) addExpForm.addEventListener('submit', handleAddExpSubmit);

        const levelConfigForm = document.getElementById('level-config-form');
        if (levelConfigForm) levelConfigForm.addEventListener('submit', handleLevelConfigSubmit);

        const addTimelineForm = document.getElementById('add-timeline-form');
        if (addTimelineForm) addTimelineForm.addEventListener('submit', handleAddTimelineSubmit);

        const fishTankForm = document.getElementById('fish-tank-form');
        if (fishTankForm) fishTankForm.addEventListener('submit', handleFishTankSubmit);

        const notificationConfigForm = document.getElementById('notification-config-form');
        if (notificationConfigForm) notificationConfigForm.addEventListener('submit', handleNotificationConfigSubmit);

        const gameConfigForm = document.getElementById('game-config-form');
        if (gameConfigForm) gameConfigForm.addEventListener('submit', handleGameConfigSubmit);

        const grantBadgeBtn = document.getElementById('grant-badge-btn');
        if (grantBadgeBtn) grantBadgeBtn.addEventListener('click', openGrantBadgeModal);

        const editBadgeDefinitionForm = document.getElementById('edit-badge-definition-form');
        if (editBadgeDefinitionForm) editBadgeDefinitionForm.addEventListener('submit', handleEditBadgeDefinitionSubmit);

        const addBadgeDefinitionBtn = document.getElementById('add-badge-definition-btn');
        if (addBadgeDefinitionBtn) addBadgeDefinitionBtn.addEventListener('click', openAddBadgeDefinitionModal);

        const addExpBtn = document.getElementById('add-exp-btn');
        if (addExpBtn) addExpBtn.addEventListener('click', () => openAddExpModal());

        const addTimelineBtn = document.getElementById('add-timeline-btn');
        if (addTimelineBtn) addTimelineBtn.addEventListener('click', openAddTimelineModal);

        // 按钮监听
        const addPortalBtn = document.getElementById('add-portal-btn');
        if (addPortalBtn) addPortalBtn.addEventListener('click', () => openPortalModal());

        const addAdvertisementBtn = document.getElementById('add-advertisement-btn');
        if (addAdvertisementBtn) addAdvertisementBtn.addEventListener('click', () => openAdvertisementModal());

        const generateCodeBtn = document.getElementById('generate-code-btn');
        if (generateCodeBtn) generateCodeBtn.addEventListener('click', openGenerateCodeModal);

        const addVipBtn = document.getElementById('add-vip-btn');
        if (addVipBtn) addVipBtn.addEventListener('click', openAddVipModal);

        const addVerifiedBtn = document.getElementById('add-verified-btn');
        if (addVerifiedBtn) addVerifiedBtn.addEventListener('click', openAddVerifiedModal);

    } else if (isIndexPage) {
        // 主页初始化
        loadProfile();
        loadAnnouncement();
        loadAdvertisements();
        loadPortals();
        // 延迟加载弹窗广告，避免影响页面加载
        setTimeout(() => {
            loadPopupAd();
        }, 1000);

        // 兑换码表单（左侧）
        const redeemFormSidebar = document.getElementById('redeem-form-sidebar');
        if (redeemFormSidebar) {
            redeemFormSidebar.addEventListener('submit', handleRedeemSubmitSidebar);
        }

        // 签到按钮
        const checkinBtn = document.getElementById('checkin-btn');
        if (checkinBtn) {
            checkinBtn.addEventListener('click', handleCheckin);
        }

        // 加载并定期更新在线人数
        startOnlineCountUpdate();
        
        // 加载通知配置并启动通知检查
        loadNotificationConfig().then(() => {
            startNotificationCheck();
        });

        // 兑换码输入格式化（自动添加横线）并检查可选内容（左侧）
        const redeemCodeInputSidebar = document.getElementById('redeem-code-sidebar');
        if (redeemCodeInputSidebar) {
            let checkTimeoutSidebar = null;
            redeemCodeInputSidebar.addEventListener('input', async (e) => {
                let value = e.target.value.replace(/[^A-Z0-9]/g, '');
                let formatted = '';
                for (let i = 0; i < value.length && i < 16; i++) {
                    if (i > 0 && i % 4 === 0) {
                        formatted += '-';
                    }
                    formatted += value[i];
                }
                e.target.value = formatted;
                
                // 延迟检查兑换码（避免频繁请求）
                clearTimeout(checkTimeoutSidebar);
                checkTimeoutSidebar = setTimeout(async () => {
                    const code = formatted.replace(/-/g, '');
                    if (code.length === 16) {
                        const codeInfo = await checkRedeemCode(formatted);
                        if (codeInfo && codeInfo.success) {
                            currentRedeemCodeInfo = codeInfo;
                            const contentSelector = document.getElementById('redeem-content-selector-sidebar');
                            const contentSelect = document.getElementById('redeem-content-select-sidebar');
                            
                            // 如果有可选内容，显示选择器
                            if (codeInfo.availableContents && codeInfo.availableContents.length > 0) {
                                contentSelector.style.display = 'block';
                                contentSelect.innerHTML = '';
                                
                                // 添加默认选项
                                const defaultOption = document.createElement('option');
                                defaultOption.value = codeInfo.value;
                                defaultOption.textContent = `默认：${codeInfo.value}`;
                                contentSelect.appendChild(defaultOption);
                                
                                // 添加可选内容
                                codeInfo.availableContents.forEach(content => {
                                    const option = document.createElement('option');
                                    option.value = content;
                                    option.textContent = content;
                                    contentSelect.appendChild(option);
                                });
                            } else {
                                contentSelector.style.display = 'none';
                            }
                        } else {
                            currentRedeemCodeInfo = null;
                            document.getElementById('redeem-content-selector-sidebar').style.display = 'none';
                        }
                    } else {
                        currentRedeemCodeInfo = null;
                        document.getElementById('redeem-content-selector-sidebar').style.display = 'none';
                    }
                }, 500);
            });
        }

        // 兑换码输入格式化（自动添加横线）并检查可选内容（保留原右侧的，以防万一）
        const redeemCodeInput = document.getElementById('redeem-code');
        if (redeemCodeInput) {
            let checkTimeout = null;
            redeemCodeInput.addEventListener('input', async (e) => {
                let value = e.target.value.replace(/[^A-Z0-9]/g, '');
                let formatted = '';
                for (let i = 0; i < value.length && i < 16; i++) {
                    if (i > 0 && i % 4 === 0) {
                        formatted += '-';
                    }
                    formatted += value[i];
                }
                e.target.value = formatted;
                
                // 延迟检查兑换码（避免频繁请求）
                clearTimeout(checkTimeout);
                checkTimeout = setTimeout(async () => {
                    const code = formatted.replace(/-/g, '');
                    if (code.length === 16) {
                        const codeInfo = await checkRedeemCode(formatted);
                        if (codeInfo && codeInfo.success) {
                            currentRedeemCodeInfo = codeInfo;
                            const contentSelector = document.getElementById('redeem-content-selector');
                            const contentSelect = document.getElementById('redeem-content-select');
                            
                            // 如果有可选内容，显示选择器
                            if (codeInfo.availableContents && codeInfo.availableContents.length > 0) {
                                contentSelector.style.display = 'block';
                                contentSelect.innerHTML = '';
                                
                                // 添加默认选项
                                const defaultOption = document.createElement('option');
                                defaultOption.value = codeInfo.value;
                                defaultOption.textContent = `默认：${codeInfo.value}`;
                                contentSelect.appendChild(defaultOption);
                                
                                // 添加可选内容
                                codeInfo.availableContents.forEach(content => {
                                    const option = document.createElement('option');
                                    option.value = content;
                                    option.textContent = content;
                                    contentSelect.appendChild(option);
                                });
                            } else {
                                contentSelector.style.display = 'none';
                            }
                        } else {
                            currentRedeemCodeInfo = null;
                            document.getElementById('redeem-content-selector').style.display = 'none';
                        }
                    } else {
                        currentRedeemCodeInfo = null;
                        document.getElementById('redeem-content-selector').style.display = 'none';
                    }
                }, 500);
            });
        }
    }
});


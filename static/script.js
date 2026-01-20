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
            // 检查是否是封禁
            if (response.status === 401 || response.status === 403) {
                if (data.message && (data.message.includes('禁用') || data.message.includes('banned'))) {
                    handleUserBanned();
                    throw new Error('账号已被禁用');
                }
            }
            
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

// 安全的图片URL生成函数，添加错误处理
function safeImageSrc(url, fallback = null, seed = null) {
    if (!url || !url.trim()) {
        return fallback || generateRandomAvatar(seed || 'default');
    }
    // 如果URL包含占位符或无效，使用默认头像
    if (url.includes('placeholder') || url.includes('undefined') || url.includes('null')) {
        return fallback || generateRandomAvatar(seed || 'default');
    }
    return url;
}

// 为图片元素添加错误处理
function setupImageErrorHandler(imgElement, fallbackUrl, seed = null) {
    if (!imgElement) return;
    
    const defaultFallback = fallbackUrl || generateRandomAvatar(seed || 'default');
    
    imgElement.onerror = function() {
        if (this.src !== defaultFallback) {
            this.src = defaultFallback;
            this.onerror = null; // 防止无限循环
        }
    };
    
    // 添加 crossorigin 属性以支持 CORS
    if (imgElement.src && !imgElement.src.startsWith('data:') && !imgElement.src.startsWith('blob:')) {
        imgElement.crossOrigin = 'anonymous';
    }
}

// 加载个人资料
async function loadProfile() {
    try {
        const profile = await apiRequest('/api/profile');
        
        // 如果用户已登录，不更新 profile-card 中的用户信息（头像、名字、简介）
        // 这些信息由 updateUserUI 根据 currentUser 更新
        if (!currentUser) {
        // 更新头像（如果没有设置头像，使用随机生成）
        const avatarEl = document.getElementById('avatar');
        if (avatarEl) {
                const avatarUrl = safeImageSrc(profile.avatar, null, profile.name || profile.email);
                avatarEl.src = avatarUrl;
                setupImageErrorHandler(avatarEl, generateRandomAvatar(profile.name || profile.email), profile.name || profile.email);
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
            // 没有邮箱时，隐藏VIP卡片区域
            const vipCardSection = document.querySelector('.vip-card-section');
            if (vipCardSection) {
                vipCardSection.style.display = 'none';
            }
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
        const vipCardSection = document.querySelector('.vip-card-section');
        const vipStatusEl = document.getElementById('vip-status-info');
        const vipStatusText = vipStatusEl?.querySelector('.vip-status-text');
        
        // 如果没有VIP，隐藏整个VIP卡片区域
        if (!result.isVip) {
            if (vipCardSection) {
                vipCardSection.style.display = 'none';
            }
            return;
        }
        
        // 有VIP，显示VIP卡片区域
        if (vipCardSection) {
            vipCardSection.style.display = 'block';
        }
        
        if (!vipStatusEl || !vipStatusText) return;
        
        if (result.expiryDate) {
            // 解析日期，支持多种格式
            let expiryDate;
            if (result.expiryDate.includes('T')) {
                expiryDate = new Date(result.expiryDate);
            } else {
                // YYYY-MM-DD 格式，设置为当天的23:59:59
                expiryDate = new Date(result.expiryDate + 'T23:59:59');
            }
            
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
            // 永久VIP
            vipStatusText.textContent = `${result.level} · 永久有效`;
            vipStatusText.className = 'vip-status-text active';
        }
    } catch (error) {
        console.error('检查VIP状态失败:', error);
        // 出错时也隐藏VIP卡片区域
        const vipCardSection = document.querySelector('.vip-card-section');
        if (vipCardSection) {
            vipCardSection.style.display = 'none';
        }
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
            const levelConfigResponse = await apiRequest('/api/level-config');
            // API返回的数据结构：{ leveling_rule: {...}, levels: [...] }
            const levelConfig = levelConfigResponse;
            
            if (levelConfig && Array.isArray(levelConfig.levels) && levelConfig.levels.length > 0) {
                const currentLevel = result.level || 1;
                const currentLevelData = levelConfig.levels.find(l => l.level === currentLevel);
                
                if (currentLevelData && currentLevelData.title) {
                    const badge = currentLevelData.badge ? `${currentLevelData.badge} ` : '';
                    levelTitle = `${badge}${currentLevelData.title}`;
                }
            }
        } catch (e) {
            // 忽略错误，使用默认显示
            console.error('获取等级配置失败:', e);
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

// 加载推荐关注用户
async function loadFeaturedUsers() {
    try {
        const result = await apiRequest('/api/featured-users');
        const section = document.getElementById('featured-users-section');
        const container = document.getElementById('featured-users-container');
        
        if (!section || !container) return;

        if (result.users && result.users.length > 0) {
            container.innerHTML = result.users.map(user => {
                const roleClass = user.roleType || 'official';
                const roleIcon = user.roleIcon || '👤';
                const stats = [];
                if (user.followers) stats.push(`<span class="featured-user-stat">👥 ${user.followers}</span>`);
                if (user.posts) stats.push(`<span class="featured-user-stat">📝 ${user.posts}</span>`);
                
                return `
                    <a href="${user.link || '#'}" target="_blank" class="featured-user-card ${roleClass}">
                        <img src="${user.avatar}" alt="${user.name}" class="featured-user-avatar" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}'">
                        <div class="featured-user-info">
                            <div class="featured-user-title-wrapper">
                                <h3 class="featured-user-name">${user.name}</h3>
                                <span class="featured-user-role">${roleIcon} ${user.role}</span>
                            </div>
                            <p class="featured-user-bio">${user.bio || '暂无简介'}</p>
                            ${stats.length > 0 ? `<div class="featured-user-stats">${stats.join('')}</div>` : ''}
                        </div>
                    </a>
                `;
            }).join('');
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    } catch (error) {
        console.error('加载推荐用户失败:', error);
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

// 后台管理员登录处理
async function handleAdminLogin(e) {
    e.preventDefault();
    console.log('🔐 管理员登录函数被调用');
    
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

// 后台管理员退出登录
function handleAdminLogout() {
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
        'game-players': '游戏玩家',
        'blackdiamond': '黑钻管理',
        'featured-users': '推荐关注',
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
    await loadGamePlayers();
    await loadBlackDiamondUsers();
    await loadFeaturedUsersAdmin();
    await loadForumUsers();
    await loadForumArticles();
    await loadPushConfig();
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

// 加载游戏玩家列表
async function loadGamePlayers() {
    try {
        const players = await apiRequest('/api/admin/game/players');
        renderGamePlayers(players);
    } catch (error) {
        console.error('加载游戏玩家失败:', error);
    }
}

// 渲染游戏玩家列表
function renderGamePlayers(players) {
    const tbody = document.getElementById('game-players-tbody');
    if (!tbody) return;

    if (players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-text">暂无游戏玩家</td></tr>';
        return;
    }

    tbody.innerHTML = players.map(player => `
        <tr>
            <td>${player.email}</td>
            <td>Lv.${player.gameLevel || 1}</td>
            <td>${player.coins || 0}</td>
            <td>${player.energy || 0}/${player.maxEnergy || 100}</td>
            <td>${player.totalHarvest || 0}</td>
            <td>${player.totalHelp || 0}</td>
            <td>
                <button class="btn-secondary" onclick="grantGameRewardTo('${player.email}')">发放奖励</button>
            </td>
        </tr>
    `).join('');
}

// 快速发放奖励
function grantGameRewardTo(email) {
    document.getElementById('grant-game-email').value = email;
    // 滚动到发放奖励表单
    document.getElementById('grant-game-reward-form').scrollIntoView({ behavior: 'smooth' });
}

// 处理发放奖励
async function handleGrantGameReward(e) {
    e.preventDefault();
    
    const type = document.getElementById('grant-game-type').value;
    const data = {
        email: document.getElementById('grant-game-email').value.trim(),
        type: type,
        amount: parseInt(document.getElementById('grant-game-amount').value)
    };
    
    if (type === 'item') {
        data.itemId = document.getElementById('grant-game-item').value.trim();
        if (!data.itemId) {
            showMessage('grant-game-message', '请输入道具ID', 'error');
            return;
        }
    }

    try {
        await apiRequest('/api/admin/game/grant', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showMessage('grant-game-message', '奖励发放成功！', 'success');
        document.getElementById('grant-game-reward-form').reset();
        await loadGamePlayers();
    } catch (error) {
        showMessage('grant-game-message', error.message, 'error');
    }
}

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

// 加载黑钻用户列表
async function loadBlackDiamondUsers() {
    try {
        const users = await apiRequest('/api/admin/game/blackdiamond');
        renderBlackDiamondUsers(users);
    } catch (error) {
        console.error('加载黑钻用户失败:', error);
    }
}

// 渲染黑钻用户列表
function renderBlackDiamondUsers(users) {
    const tbody = document.getElementById('blackdiamond-tbody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-text">暂无黑钻会员</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        const levelNames = ['', '黑钻1', '黑钻2', '黑钻3', '黑钻4'];
        return `
            <tr>
                <td>${user.email}</td>
                <td><span class="status-badge enabled">${levelNames[user.level] || '黑钻1'}</span></td>
                <td>${formatDate(user.expireAt)}</td>
                <td>${user.totalMonths || 0}个月</td>
                <td>${user.consecutiveMonths || 0}个月</td>
                <td>
                    <button class="btn-secondary" onclick="openGrantBlackDiamondModal('${user.email}')">续费</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 打开黑钻开通弹窗
function openGrantBlackDiamondModal(email = '') {
    const modal = document.getElementById('grant-blackdiamond-modal');
    const form = document.getElementById('grant-blackdiamond-form');
    form.reset();
    if (email) {
        document.getElementById('bd-email').value = email;
    }
    modal.style.display = 'flex';
}

// 关闭黑钻开通弹窗
function closeGrantBlackDiamondModal() {
    const modal = document.getElementById('grant-blackdiamond-modal');
    modal.style.display = 'none';
}

// 处理黑钻开通
async function handleGrantBlackDiamond(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('bd-email').value.trim(),
        months: parseInt(document.getElementById('bd-months').value)
    };

    try {
        await apiRequest('/api/admin/game/blackdiamond/grant', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        alert('黑钻开通成功！');
        closeGrantBlackDiamondModal();
        await loadBlackDiamondUsers();
    } catch (error) {
        alert('开通失败: ' + error.message);
    }
}

// 重置游戏数据
async function resetGameData(type) {
    if (!confirm(`确定要重置${type === 'items' ? '道具' : '事件'}数据吗？这将覆盖现有配置！`)) {
        return;
    }
    
    try {
        const result = await apiRequest('/api/admin/game/reset-data', {
            method: 'POST',
            body: JSON.stringify({ type })
        });

        showMessage('reset-data-message', result.message, 'success');
    } catch (error) {
        showMessage('reset-data-message', error.message, 'error');
    }
}

// ==================== 推荐关注用户管理 ====================

let currentFeaturedUsers = [];

async function loadFeaturedUsersAdmin() {
    try {
        currentFeaturedUsers = await apiRequest('/api/admin/featured-users');
        renderFeaturedUsersList();
    } catch (error) {
        console.error('加载推荐用户失败:', error);
    }
}

function renderFeaturedUsersList() {
    const container = document.getElementById('featured-users-list');
    if (!container) return;

    if (currentFeaturedUsers.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="empty-state-text">暂无推荐用户</p></div>';
        return;
    }

    // 按排序字段排序
    const sortedUsers = [...currentFeaturedUsers].sort((a, b) => (a.order || 0) - (b.order || 0));

    container.innerHTML = sortedUsers.map((user, index) => {
        const roleTypeNames = {
            emperor: '👑 皇上',
            empress: '👸 皇后',
            prince: '🤴 太子',
            official: '📜 大臣'
        };
        
        return `
            <div class="item-card">
                <img src="${user.avatar}" alt="${user.name}" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 12px;" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}'">
                <div class="item-info">
                    <div class="item-name">${user.name} <small style="color: var(--text-muted);">${roleTypeNames[user.roleType] || user.role}</small></div>
                    <div class="item-desc">${user.bio || '暂无简介'}</div>
                    <div class="item-url" style="font-size: 0.8rem;">${user.link || '-'}</div>
                </div>
                <span class="item-badge ${user.enabled ? 'enabled' : 'disabled'}">
                    ${user.enabled ? '启用' : '禁用'}
                </span>
                <div class="item-actions">
                    <button class="btn-secondary" onclick="editFeaturedUser(${index})">编辑</button>
                    <button class="btn-danger" onclick="deleteFeaturedUser(${index})">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAddFeaturedUserModal() {
    const modal = document.getElementById('add-featured-user-modal');
    const form = document.getElementById('featured-user-form');
    form.reset();
    document.getElementById('featured-user-id').value = '';
    document.getElementById('featured-user-modal-title').textContent = '添加推荐用户';
    document.getElementById('featured-user-enabled').checked = true;
    modal.style.display = 'flex';
}

function closeAddFeaturedUserModal() {
    const modal = document.getElementById('add-featured-user-modal');
    modal.style.display = 'none';
}

function editFeaturedUser(index) {
    const user = currentFeaturedUsers[index];
    const modal = document.getElementById('add-featured-user-modal');
    
    document.getElementById('featured-user-id').value = index;
    document.getElementById('featured-user-name').value = user.name;
    document.getElementById('featured-user-role').value = user.role;
    document.getElementById('featured-user-role-type').value = user.roleType || 'official';
    document.getElementById('featured-user-role-icon').value = user.roleIcon || '👤';
    document.getElementById('featured-user-avatar').value = user.avatar;
    document.getElementById('featured-user-bio').value = user.bio || '';
    document.getElementById('featured-user-link').value = user.link || '';
    document.getElementById('featured-user-followers').value = user.followers || '';
    document.getElementById('featured-user-posts').value = user.posts || '';
    document.getElementById('featured-user-order').value = user.order || 0;
    document.getElementById('featured-user-enabled').checked = user.enabled !== false;
    document.getElementById('featured-user-modal-title').textContent = '编辑推荐用户';
    
    modal.style.display = 'flex';
}

async function deleteFeaturedUser(index) {
    if (!confirm('确定要删除这个推荐用户吗？')) return;
    
    currentFeaturedUsers.splice(index, 1);
    await saveFeaturedUsers();
}

async function handleFeaturedUserSubmit(e) {
    e.preventDefault();
    
    const index = document.getElementById('featured-user-id').value;
    const user = {
        name: document.getElementById('featured-user-name').value.trim(),
        role: document.getElementById('featured-user-role').value.trim(),
        roleType: document.getElementById('featured-user-role-type').value,
        roleIcon: document.getElementById('featured-user-role-icon').value.trim(),
        avatar: document.getElementById('featured-user-avatar').value.trim(),
        bio: document.getElementById('featured-user-bio').value.trim(),
        link: document.getElementById('featured-user-link').value.trim(),
        followers: parseInt(document.getElementById('featured-user-followers').value) || 0,
        posts: parseInt(document.getElementById('featured-user-posts').value) || 0,
        order: parseInt(document.getElementById('featured-user-order').value) || 0,
        enabled: document.getElementById('featured-user-enabled').checked
    };

    if (index !== '') {
        currentFeaturedUsers[parseInt(index)] = user;
    } else {
        currentFeaturedUsers.push(user);
    }

    await saveFeaturedUsers();
    closeAddFeaturedUserModal();
}

async function saveFeaturedUsers() {
    try {
        await apiRequest('/api/admin/featured-users', {
            method: 'PUT',
            body: JSON.stringify(currentFeaturedUsers)
        });

        showMessage('featured-users-message', '推荐用户列表保存成功！', 'success');
        renderFeaturedUsersList();
    } catch (error) {
        showMessage('featured-users-message', error.message, 'error');
    }
}

// 确保所有管理函数全局可访问
window.resetGameData = resetGameData;
window.openGrantBlackDiamondModal = openGrantBlackDiamondModal;
window.closeGrantBlackDiamondModal = closeGrantBlackDiamondModal;
window.handleGrantBlackDiamond = handleGrantBlackDiamond;
window.grantGameRewardTo = grantGameRewardTo;
window.handleGrantGameReward = handleGrantGameReward;
window.loadGamePlayers = loadGamePlayers;
window.openAddFeaturedUserModal = openAddFeaturedUserModal;
window.closeAddFeaturedUserModal = closeAddFeaturedUserModal;
window.editFeaturedUser = editFeaturedUser;
window.deleteFeaturedUser = deleteFeaturedUser;
window.handleFeaturedUserSubmit = handleFeaturedUserSubmit;

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

        // 登录表单（后台管理）
        const loginForm = document.getElementById('login-form');
        console.log('🔍 查找登录表单:', loginForm);
        if (loginForm) {
            // 检查是否在管理后台页面（有 username 字段）
            const usernameField = document.getElementById('username');
            if (usernameField) {
                // 后台管理登录
                loginForm.addEventListener('submit', handleAdminLogin);
                console.log('✅ 管理后台登录表单事件已绑定');
        } else {
                // 前台用户登录（由 index.html 的 onsubmit 处理）
                console.log('ℹ️ 前台用户登录表单由 HTML onsubmit 处理');
            }
        } else {
            console.log('ℹ️ 未找到登录表单（可能是主页）');
        }

        // 后台管理退出登录
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            // 检查是否在管理后台页面
            const adminPage = document.getElementById('admin-page');
            if (adminPage) {
                logoutBtn.addEventListener('click', handleAdminLogout);
                console.log('✅ 管理后台退出按钮事件已绑定');
            }
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

        // 游戏奖励类型切换
        const grantGameType = document.getElementById('grant-game-type');
        if (grantGameType) {
            grantGameType.addEventListener('change', (e) => {
                const itemGroup = document.getElementById('grant-game-item-group');
                if (itemGroup) {
                    itemGroup.style.display = e.target.value === 'item' ? 'block' : 'none';
                }
            });
        }

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
        // 先初始化用户认证状态，然后再加载 profile（这样 loadProfile 可以检查 currentUser）
        initUserAuth().then(() => {
        loadProfile();
        });
        loadAnnouncement();
        loadFeaturedUsers();
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

// ==================== 用户认证系统 ====================

// 用户状态
let currentUser = null;
let userToken = localStorage.getItem('userToken');

// 处理用户被封禁
function handleUserBanned() {
    localStorage.removeItem('userToken');
    userToken = null;
    currentUser = null;
    updateUserUI();
    showToast('账号已被禁用，已自动退出登录', 'error');
    // 关闭所有弹窗
    closeHeatModal();
    closeArticleDetail();
    const modals = document.querySelectorAll('.modal-overlay, .auth-modal, .editor-modal, .detail-modal');
    modals.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });
}

// 检查响应是否表示用户被封禁
function checkBannedStatus(response, data) {
    if (!response.ok && (response.status === 401 || response.status === 403)) {
        if (data && data.message && (data.message.includes('禁用') || data.message.includes('banned'))) {
            handleUserBanned();
            return true;
        }
    }
    return false;
}

// 初始化用户状态
async function initUserAuth() {
    if (userToken) {
        try {
            const response = await fetch(`${API_BASE}/api/user/me`, {
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });
            const data = await response.json();
            
            // 检查是否被封禁
            if (checkBannedStatus(response, data)) {
                return;
            }
            
            if (data.success && data.isLoggedIn) {
                currentUser = data.user;
                updateUserUI();
            } else {
                // Token 无效，清除
                localStorage.removeItem('userToken');
                userToken = null;
                currentUser = null;
                updateUserUI();
            }
        } catch (error) {
            console.error('验证用户状态失败:', error);
            updateUserUI();
        }
    } else {
        updateUserUI();
    }
}

// 更新用户界面
function updateUserUI() {
    const guestActions = document.getElementById('guest-actions');
    const userActions = document.getElementById('user-actions');
    const headerAvatar = document.getElementById('header-avatar');
    const headerNickname = document.getElementById('header-nickname');
    const userInfoSections = document.getElementById('user-info-sections');
    const loginPromptSection = document.getElementById('login-prompt-section');
    const profileCard = document.querySelector('.profile-card');
    
    if (currentUser) {
        // 已登录
        if (guestActions) guestActions.style.display = 'none';
        if (userActions) userActions.style.display = 'flex';
        if (userInfoSections) userInfoSections.style.display = 'block';
        if (loginPromptSection) loginPromptSection.style.display = 'none';
        if (profileCard) profileCard.style.display = 'block';
        
        if (headerNickname) headerNickname.textContent = currentUser.nickname;
        if (headerAvatar) {
            const headerAvatarUrl = safeImageSrc(currentUser.avatar, null, currentUser.email);
            headerAvatar.src = headerAvatarUrl;
            setupImageErrorHandler(headerAvatar, generateRandomAvatar(currentUser.email), currentUser.email);
        }
        
        // 更新 profile-card 显示当前用户信息
        const nameEl = document.getElementById('name');
        const bioEl = document.getElementById('bio');
        const avatarEl = document.getElementById('avatar');
        if (nameEl) nameEl.textContent = currentUser.nickname || currentUser.email;
        if (bioEl) bioEl.textContent = currentUser.bio || '这个人很懒，什么都没写~';
        if (avatarEl) {
            const avatarUrl = safeImageSrc(currentUser.avatar, null, currentUser.email);
            avatarEl.src = avatarUrl;
            setupImageErrorHandler(avatarEl, generateRandomAvatar(currentUser.email), currentUser.email);
        }
        
        // 加载用户统计信息
        loadUserStats();
    } else {
        // 未登录
        if (guestActions) guestActions.style.display = 'flex';
        if (userActions) userActions.style.display = 'none';
        if (userInfoSections) userInfoSections.style.display = 'none';
        if (loginPromptSection) loginPromptSection.style.display = 'block';
        if (profileCard) profileCard.style.display = 'none';
    }
}

// 加载用户统计信息
async function loadUserStats() {
    if (!userToken) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/user/stats`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const data = await response.json();
        
        // 检查是否被封禁
        if (checkBannedStatus(response, data)) {
            return;
        }
        
        if (data.success) {
            const stats = data.stats;
            
            // 更新等级和积分显示
            const levelEl = document.getElementById('user-level');
            const coinsEl = document.getElementById('user-coins');
            const currentExpEl = document.getElementById('current-exp');
            const nextLevelExpEl = document.getElementById('next-level-exp');
            const expProgressEl = document.getElementById('exp-progress');
            const checkinBtn = document.getElementById('checkin-btn');
            
            // 获取等级配置以显示官品
            let levelTitle = `Lv.${stats.level || 1}`;
            try {
                const levelConfigResponse = await apiRequest('/api/level-config');
                // API返回的数据结构：{ leveling_rule: {...}, levels: [...] }
                const levelConfig = levelConfigResponse;
                
                if (levelConfig && Array.isArray(levelConfig.levels) && levelConfig.levels.length > 0) {
                    const currentLevel = stats.level || 1;
                    const currentLevelData = levelConfig.levels.find(l => l.level === currentLevel);
                    
                    if (currentLevelData) {
                        if (currentLevelData.title) {
                            const badge = currentLevelData.badge ? `${currentLevelData.badge} ` : '';
                            levelTitle = `${badge}${currentLevelData.title}`;
                        }
                    }
                }
            } catch (e) {
                // 忽略错误，使用默认显示
                console.error('获取等级配置失败:', e);
            }
            
            if (levelEl) levelEl.textContent = levelTitle;
            if (coinsEl) coinsEl.textContent = stats.coins;
            if (currentExpEl) currentExpEl.textContent = stats.exp;
            if (nextLevelExpEl) nextLevelExpEl.textContent = stats.nextLevelExp;
            
            if (expProgressEl) {
                const progress = stats.nextLevelExp > 0 ? (stats.exp / stats.nextLevelExp) * 100 : 0;
                expProgressEl.style.width = `${Math.min(progress, 100)}%`;
            }
            
            if (checkinBtn) {
                if (stats.canCheckin) {
                    checkinBtn.disabled = false;
                    checkinBtn.innerHTML = '<span class="btn-text">✨ 每日签到</span>';
                    checkinBtn.classList.remove('btn-checked');
                } else {
                    checkinBtn.disabled = true;
                    checkinBtn.innerHTML = '<span class="btn-text">✅ 今日已签到</span>';
                    checkinBtn.classList.add('btn-checked');
                }
            }
            
            // 更新 VIP 显示
            const vipCard = document.querySelector('.vip-card-section');
            if (vipCard) {
                if (stats.vip && stats.vip.level) {
                    vipCard.style.display = 'block';
                    const vipLevelEl = vipCard.querySelector('.vip-level');
                    const vipExpireEl = vipCard.querySelector('.vip-expire');
                    if (vipLevelEl) vipLevelEl.textContent = stats.vip.level;
                    
                    if (vipExpireEl) {
                        if (stats.vip.expireAt) {
                            // 计算剩余天数
                            // expireAt可能是 YYYY-MM-DD 格式或 ISO 字符串
                            let expireDate;
                            if (stats.vip.expireAt.includes('T')) {
                                // ISO 格式
                                expireDate = new Date(stats.vip.expireAt);
                            } else {
                                // YYYY-MM-DD 格式，需要设置为当天的23:59:59
                                const dateStr = stats.vip.expireAt;
                                expireDate = new Date(dateStr + 'T23:59:59');
                            }
                            
                            const now = new Date();
                            const diffMs = expireDate - now;
                            const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                            
                            if (daysLeft > 0) {
                                // 格式化日期显示
                                const displayDate = stats.vip.expireAt.split('T')[0].replace(/-/g, '/');
                                vipExpireEl.textContent = `${stats.vip.level} · 剩余 ${daysLeft} 天 (至 ${displayDate})`;
                            } else {
                                vipExpireEl.textContent = `${stats.vip.level} · 已过期`;
                            }
                        } else {
                            vipExpireEl.textContent = `${stats.vip.level} · 永久有效`;
                        }
                    }
                } else {
                    vipCard.style.display = 'none';
                }
            }
            
            // 更新勋章显示
            renderUserBadges(stats.badges || []);
            
            // 更新认证状态
            if (stats.verified) {
                const nameEl = document.getElementById('name');
                if (nameEl && !nameEl.querySelector('.verified-badge')) {
                    nameEl.innerHTML += '<span class="verified-badge" title="金V认证">✓</span>';
                    nameEl.classList.add('golden-text');
                }
            }
        }
    } catch (error) {
        console.error('加载用户统计失败:', error);
    }
}

// 渲染用户勋章
async function renderUserBadges(userBadges) {
    const container = document.getElementById('badges-container');
    if (!container) return;
    
    if (!userBadges || userBadges.length === 0) {
        container.innerHTML = '<p class="empty-badges">暂无勋章，继续努力吧！</p>';
        return;
    }
    
    // 获取所有勋章定义
    try {
        const badgesData = await fetch(`${API_BASE}/api/badges`).then(r => r.json());
        const allBadges = badgesData || [];
        
        container.innerHTML = userBadges.map(ub => {
            const badge = allBadges.find(b => b.id === ub.id);
            return badge ? `
                <div class="badge-item" data-badge-name="${badge.name}" title="${badge.description || '获得于 ' + formatDate(ub.awardedAt)}">
                    <span class="badge-icon">${badge.icon || '🏆'}</span>
                    <span class="badge-name">${badge.name}</span>
                </div>
            ` : '';
        }).join('');
    } catch (error) {
        console.error('加载勋章失败:', error);
        container.innerHTML = '<p class="empty-badges">加载失败</p>';
    }
}

// 用户签到
async function handleUserCheckin() {
    if (!userToken) {
        showLoginModal();
        return;
    }
    
    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
        checkinBtn.disabled = true;
        checkinBtn.innerHTML = '<span class="btn-text">签到中...</span>';
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/user/checkin`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message);
            
            // 更新显示
            const coinsEl = document.getElementById('user-coins');
            const levelEl = document.getElementById('user-level');
            
            if (coinsEl) coinsEl.textContent = data.coins;
            if (levelEl) levelEl.textContent = `Lv.${data.level}`;
            
            if (checkinBtn) {
                checkinBtn.innerHTML = '<span class="btn-text">✅ 今日已签到</span>';
                checkinBtn.classList.add('btn-checked');
            }
            
            // 显示签到奖励动画
            showCheckinReward(data.reward);
        } else {
            showToast(data.message || '签到失败', 'error');
            if (checkinBtn) {
                checkinBtn.disabled = false;
                checkinBtn.innerHTML = '<span class="btn-text">✨ 每日签到</span>';
            }
        }
    } catch (error) {
        console.error('签到失败:', error);
        showToast('网络错误，请稍后重试', 'error');
        if (checkinBtn) {
            checkinBtn.disabled = false;
            checkinBtn.innerHTML = '<span class="btn-text">✨ 每日签到</span>';
        }
    }
}

// 显示签到奖励动画
function showCheckinReward(reward) {
    const notification = document.createElement('div');
    notification.className = 'checkin-reward-popup';
    notification.innerHTML = `
        <div class="reward-content">
            <span class="reward-icon">🎉</span>
            <span class="reward-text">+${reward} 积分</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}

// 显示登录弹窗
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('login-error').style.display = 'none';
        document.getElementById('login-form').reset();
    }
}

// 关闭登录弹窗
function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'none';
}

// 显示注册弹窗
function showRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('register-error').style.display = 'none';
        document.getElementById('register-form').reset();
    }
}

// 关闭注册弹窗
function closeRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.style.display = 'none';
}

// 切换到注册
function switchToRegister() {
    closeLoginModal();
    showRegisterModal();
}

// 切换到登录
function switchToLogin() {
    closeRegisterModal();
    showLoginModal();
}

// 处理登录
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';
    
    try {
        const response = await fetch(`${API_BASE}/api/user/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('userToken', data.token);
            userToken = data.token;
            currentUser = data.user;
            closeLoginModal();
            updateUserUI();
            showToast('登录成功！欢迎回来，' + data.user.nickname);
        } else {
            errorEl.textContent = data.message || '登录失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
    }
    
    submitBtn.disabled = false;
    submitBtn.textContent = '登录';
}

// 处理注册
async function handleRegister(event) {
    event.preventDefault();
    
    const nickname = document.getElementById('register-nickname').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('register-error');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    if (password !== confirm) {
        errorEl.textContent = '两次输入的密码不一致';
        errorEl.style.display = 'block';
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = '注册中...';
    
    try {
        const response = await fetch(`${API_BASE}/api/user/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('userToken', data.token);
            userToken = data.token;
            currentUser = data.user;
            closeRegisterModal();
            updateUserUI();
            showToast('注册成功！欢迎，' + data.user.nickname);
        } else {
            errorEl.textContent = data.message || '注册失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
    }
    
    submitBtn.disabled = false;
    submitBtn.textContent = '注册';
}

// 处理登出
async function handleLogout() {
    try {
        await fetch(`${API_BASE}/api/user/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
    } catch (error) {
        console.error('登出请求失败:', error);
    }
    
    localStorage.removeItem('userToken');
    userToken = null;
    currentUser = null;
    updateUserUI();
    closeUserMenu();
    showToast('已成功退出登录');
}

// 切换用户菜单
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// 关闭用户菜单
function closeUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    const userMenuWrapper = document.querySelector('.user-menu-wrapper');
    if (userMenuWrapper && !userMenuWrapper.contains(e.target)) {
        closeUserMenu();
    }
});

// 显示提示消息
function showToast(message, type = 'success') {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: #FFFFFF;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 99999;
        animation: fadeInUp 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 显示用户设置
function showUserProfile() {
    closeUserMenu();
    const modal = document.getElementById('user-profile-modal');
    if (modal && currentUser) {
        modal.style.display = 'flex';
        document.getElementById('profile-nickname').value = currentUser.nickname || '';
        document.getElementById('profile-avatar').value = currentUser.avatar || '';
        document.getElementById('profile-bio').value = currentUser.bio || '';
        document.getElementById('profile-error').style.display = 'none';
    }
}

// 关闭用户设置
function closeUserProfile() {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
}

// 处理更新资料
async function handleUpdateProfile(event) {
    event.preventDefault();
    
    const nickname = document.getElementById('profile-nickname').value;
    const avatar = document.getElementById('profile-avatar').value;
    const bio = document.getElementById('profile-bio').value;
    const errorEl = document.getElementById('profile-error');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';
    
    try {
        const response = await fetch(`${API_BASE}/api/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ nickname, avatar, bio })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserUI();
            closeUserProfile();
            showToast('资料更新成功');
        } else {
            errorEl.textContent = data.message || '更新失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
    }
    
    submitBtn.disabled = false;
    submitBtn.textContent = '保存修改';
}

// ==================== 文章系统 ====================

// 文章列表状态
let articlesData = {
    articles: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
};
let currentCategory = '';
let currentSearch = '';
let articleCategories = [];
let articleTags = [];
let selectedArticleTags = [];
let editingArticleId = null;

// 加载文章分类
async function loadArticleCategories() {
    try {
        const response = await fetch(`${API_BASE}/api/articles/categories`);
        const data = await response.json();
        
        if (data.success) {
            articleCategories = data.categories;
            
            // 更新筛选下拉框
            const filterSelect = document.getElementById('category-filter');
            if (filterSelect) {
                filterSelect.innerHTML = '<option value="">全部分类</option>';
                articleCategories.forEach(cat => {
                    filterSelect.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
                });
            }
            
            // 更新编辑器下拉框
            const editorSelect = document.getElementById('article-category-input');
            if (editorSelect) {
                editorSelect.innerHTML = '';
                articleCategories.forEach(cat => {
                    editorSelect.innerHTML += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('加载文章分类失败:', error);
    }
}

// 加载文章标签
async function loadArticleTags() {
    try {
        const response = await fetch(`${API_BASE}/api/articles/tags`);
        const data = await response.json();
        
        if (data.success) {
            articleTags = data.tags;
            
            // 更新编辑器标签选择器
            const tagSelector = document.getElementById('tag-selector');
            if (tagSelector) {
                tagSelector.innerHTML = '<option value="">选择标签...</option>';
                articleTags.forEach(tag => {
                    tagSelector.innerHTML += `<option value="${tag.id}">${tag.name}</option>`;
                });
            }
            
            // 更新标签筛选按钮
            const tagsFilter = document.getElementById('tags-filter');
            if (tagsFilter) {
                let html = '<button class="tag-filter-btn active" data-tag="" onclick="clearTagFilter()">全部</button>';
                articleTags.forEach(tag => {
                    html += `<button class="tag-filter-btn" data-tag="${tag.id}" onclick="filterByTag('${tag.id}')" style="--tag-color: ${tag.color}">${tag.name}</button>`;
                });
                tagsFilter.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('加载文章标签失败:', error);
    }
}

// 文章每页数量
const ARTICLES_PER_PAGE = 3;
let currentTag = ''; // 当前标签筛选
let allLoadedArticles = []; // 所有已加载的文章

// 加载文章列表
async function loadArticles(page = 1, append = false) {
    const container = document.getElementById('articles-container');
    if (!container) return;
    
    if (!append) {
        // 重新加载时显示加载状态
        container.innerHTML = `
            <div class="article-loading">
                <span class="loading-spinner"></span>
                <p>正在加载文章...</p>
            </div>
        `;
        allLoadedArticles = [];
    }
    
    try {
        let url = `${API_BASE}/api/articles?page=${page}&limit=${ARTICLES_PER_PAGE}`;
        if (currentCategory) url += `&category=${currentCategory}`;
        if (currentTag) url += `&tag=${currentTag}`;
        if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            articlesData = data;
            
            if (append) {
                // 追加模式：添加新文章到列表
                allLoadedArticles = [...allLoadedArticles, ...data.articles];
            } else {
                // 新加载模式：替换文章列表
                allLoadedArticles = data.articles;
            }
            
            renderArticles();
            renderLoadMoreButton();
        } else {
            if (!append) {
                container.innerHTML = `
                    <div class="article-empty">
                        <div class="article-empty-icon">📭</div>
                        <p>加载文章失败</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('加载文章列表失败:', error);
        if (!append) {
            container.innerHTML = `
                <div class="article-empty">
                    <div class="article-empty-icon">❌</div>
                    <p>网络错误，请稍后重试</p>
                </div>
            `;
        }
    }
}

// 加载更多文章
function loadMoreArticles() {
    if (articlesData && articlesData.pagination) {
        const { page, totalPages } = articlesData.pagination;
        if (page < totalPages) {
            loadArticles(page + 1, true);
        }
    }
}

// 渲染文章列表
function renderArticles() {
    const container = document.getElementById('articles-container');
    if (!container) return;
    
    if (allLoadedArticles.length === 0) {
        container.innerHTML = `
            <div class="article-empty">
                <div class="article-empty-icon">📝</div>
                <p>暂无文章</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = allLoadedArticles.map(article => {
        const categoryObj = articleCategories.find(c => c.id === article.category);
        const categoryName = categoryObj ? `${categoryObj.icon} ${categoryObj.name}` : article.category;
        
        // 检查状态
        const isHot = article.tags && article.tags.includes('hot');
        const isRecommend = article.tags && article.tags.includes('recommend');
        const isHeated = article.isHeated;
        const isPinned = article.isPinned;
        
        // 计算加热剩余时间
        let heatTimeLeft = '';
        if (isHeated && article.heatExpireAt) {
            const remaining = new Date(article.heatExpireAt) - new Date();
            if (remaining > 0) {
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                heatTimeLeft = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
            }
        }
        
        // 构建样式类
        let cardClasses = 'article-card';
        if (isPinned) cardClasses += ' article-pinned';
        else if (isHeated) cardClasses += ' article-heated';
        else if (isHot) cardClasses += ' article-hot';
        else if (isRecommend) cardClasses += ' article-recommend';
        
        return `
            <div class="${cardClasses}" onclick="showArticleDetail('${article.id}')">
                ${isPinned ? '<span class="article-badge pinned">📌 置顶</span>' : ''}
                ${isHeated && !isPinned ? '<span class="article-badge heated">🔥 加热中</span>' : ''}
                ${isHot && !isPinned && !isHeated ? '<span class="article-badge hot">🔥 火爆</span>' : ''}
                ${isRecommend && !isPinned && !isHeated && !isHot ? '<span class="article-badge recommend">📌 推荐</span>' : ''}
                ${article.cover ? `<img src="${safeImageSrc(article.cover, null, article.id)}" alt="" class="article-cover" crossorigin="anonymous" onerror="this.onerror=null; this.style.display='none';">` : ''}
                <div class="article-info">
                    <h3 class="article-title ${isHeated ? 'golden-text' : ''}">${escapeHtml(article.title)}</h3>
                    <p class="article-summary">${escapeHtml(article.summary)}</p>
                    <div class="article-meta">
                        <div class="article-author" onclick="event.stopPropagation(); showAuthorPage('${article.authorId}')" style="cursor: pointer;" title="查看作者主页">
                            <img src="${safeImageSrc(article.authorAvatar, generateRandomAvatar(article.authorName), article.authorName)}" alt="" class="article-author-avatar" crossorigin="anonymous" onerror="this.onerror=null; this.src='${generateRandomAvatar(article.authorName)}';">
                            <span class="article-author-name ${article.authorVerified ? 'golden-text' : ''}">${escapeHtml(article.authorName)}</span>
                            ${article.authorVerified ? '<span class="verified-badge" title="金V认证">✓</span>' : ''}
                        </div>
                        <span class="article-category">${categoryName}</span>
                        <div class="article-tags">
                            ${(article.tags || []).filter(t => t !== 'hot' && t !== 'recommend').slice(0, 2).map(tagId => {
                                const tag = articleTags.find(t => t.id === tagId);
                                return tag ? `<span class="article-tag" style="background: ${tag.color}20; color: ${tag.color}">${tag.name}</span>` : '';
                            }).join('')}
                        </div>
                        <div class="article-stats">
                            <span>👁️ ${article.views || 0}</span>
                            ${isHeated ? `<span class="heat-countdown">${heatTimeLeft}</span>` : ''}
                            ${isPinned ? `<span class="pin-mark">置顶</span>` : ''}
                            <span>📅 ${formatDate(article.publishedAt || article.createdAt).split(' ')[0]}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 渲染"加载更多"按钮
function renderLoadMoreButton() {
    const container = document.getElementById('articles-pagination');
    if (!container) return;
    
    if (!articlesData || !articlesData.pagination) {
        container.style.display = 'none';
        return;
    }
    
    const { page, totalPages, total } = articlesData.pagination;
    
    if (page >= totalPages) {
        // 已经加载完所有文章
        if (allLoadedArticles.length > 0) {
            container.style.display = 'block';
            container.innerHTML = `
                <div class="load-more-info">
                    <span>已显示全部 ${total} 篇文章</span>
                </div>
            `;
        } else {
            container.style.display = 'none';
        }
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = `
        <button class="btn-load-more" onclick="loadMoreArticles()">
            加载更多 (${allLoadedArticles.length}/${total})
        </button>
    `;
}

// 兼容旧的 renderPagination 调用
function renderPagination() {
    renderLoadMoreButton();
}

// 筛选文章（分类）
function filterArticles() {
    const select = document.getElementById('category-filter');
    if (select) {
        currentCategory = select.value;
        loadArticles(1);
    }
}

// 筛选文章（标签）
function filterByTag(tagId) {
    currentTag = tagId;
    // 更新标签按钮状态
    document.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tag === tagId);
    });
    loadArticles(1);
}

// 清除标签筛选
function clearTagFilter() {
    currentTag = '';
    document.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    loadArticles(1);
}

// 搜索文章
function searchArticles() {
    const input = document.getElementById('article-search');
    if (input) {
        currentSearch = input.value.trim();
        loadArticles(1);
    }
}

// 搜索框回车
function handleSearchKeyup(event) {
    if (event.key === 'Enter') {
        searchArticles();
    }
}

// 显示文章详情
async function showArticleDetail(articleId) {
    const modal = document.getElementById('article-detail-modal');
    const container = document.getElementById('article-detail-container');
    
    if (!modal || !container) return;
    
    modal.style.display = 'block';
    container.innerHTML = `
        <div class="article-loading">
            <span class="loading-spinner"></span>
            <p>正在加载文章...</p>
        </div>
    `;
    
    try {
        const headers = {};
        if (userToken) {
            headers['Authorization'] = `Bearer ${userToken}`;
        }
        
        const response = await fetch(`${API_BASE}/api/articles/${articleId}`, { headers });
        const data = await response.json();
        
        if (data.success) {
            const article = data.article;
            const categoryObj = articleCategories.find(c => c.id === article.category);
            const categoryName = categoryObj ? `${categoryObj.icon} ${categoryObj.name}` : article.category;
            
            // 使用 marked 渲染 Markdown
            let contentHtml = article.content;
            if (typeof marked !== 'undefined') {
                contentHtml = marked.parse(article.content);
            }
            
            // 判断权限
            const canEdit = currentUser && (currentUser.id === article.authorId || currentUser.role === 'admin');
            const isOwner = currentUser && currentUser.id === article.authorId;
            const isHeated = article.isHeated;
            
            // 计算加热剩余时间
            let heatTimeInfo = '';
            if (isHeated && article.heatExpireAt) {
                const remaining = new Date(article.heatExpireAt) - new Date();
                if (remaining > 0) {
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    heatTimeInfo = `加热中，剩余 ${hours}h ${minutes}m`;
                }
            }
            
            container.innerHTML = `
                <div class="article-detail ${isHeated ? 'article-detail-heated' : ''}">
                    ${isHeated ? '<div class="heated-banner">🔥 热门文章 - ${heatTimeInfo}</div>' : ''}
                    <div class="article-detail-header">
                        <h1 class="article-detail-title ${isHeated ? 'golden-text' : ''}">${escapeHtml(article.title)}</h1>
                        <div class="article-detail-meta">
                            <div class="article-detail-author" onclick="showAuthorPage('${article.authorId}')" style="cursor: pointer;">
                                <img src="${safeImageSrc(article.authorAvatar, generateRandomAvatar(article.authorName), article.authorName)}" alt="" class="article-detail-author-avatar" crossorigin="anonymous" onerror="this.onerror=null; this.src='${generateRandomAvatar(article.authorName)}';">
                                <div class="article-detail-author-info">
                                    <span class="article-detail-author-name ${article.authorVerified ? 'golden-text' : ''}">${escapeHtml(article.authorName)}</span>
                                    ${article.authorVerified ? '<span class="verified-badge">✓</span>' : ''}
                                    <span class="article-detail-date">${formatDate(article.publishedAt || article.createdAt)}</span>
                                </div>
                            </div>
                            <span class="article-category">${categoryName}</span>
                            <div class="article-detail-stats">
                                <span>👁️ ${article.views || 0} 次浏览</span>
                                ${isHeated ? `<span class="heat-status">🔥 ${heatTimeInfo}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    ${article.cover ? `<img src="${safeImageSrc(article.cover, null, article.id)}" alt="" class="article-detail-cover" crossorigin="anonymous" onerror="this.onerror=null; this.style.display='none';">` : ''}
                    <div class="article-detail-content">${contentHtml}</div>
                    ${article.tags && article.tags.length > 0 ? `
                        <div class="article-detail-tags">
                            ${article.tags.map(tagId => {
                                const tag = articleTags.find(t => t.id === tagId);
                                return tag ? `<span class="article-tag" style="background: ${tag.color}20; color: ${tag.color}">${tag.name}</span>` : '';
                            }).join('')}
                        </div>
                    ` : ''}
                    <div class="article-detail-actions">
                        ${isOwner && !isHeated ? `
                            <button class="btn-heat-article" onclick="heatMyArticle('${article.id}')">
                                🔥 加热文章
                            </button>
                        ` : ''}
                        ${canEdit ? `
                            <button class="btn-edit-article" onclick="editArticle('${article.id}')">✏️ 编辑</button>
                            <button class="btn-delete-article" onclick="deleteArticle('${article.id}')">🗑️ 删除</button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="article-empty">
                    <div class="article-empty-icon">❌</div>
                    <p>${data.message || '文章不存在'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载文章详情失败:', error);
        container.innerHTML = `
            <div class="article-empty">
                <div class="article-empty-icon">❌</div>
                <p>网络错误，请稍后重试</p>
            </div>
        `;
    }
}

// 关闭文章详情
function closeArticleDetail() {
    const modal = document.getElementById('article-detail-modal');
    if (modal) modal.style.display = 'none';
}

// 显示文章编辑器
function showArticleEditor(article = null) {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const modal = document.getElementById('article-editor-modal');
    const title = document.getElementById('editor-title');
    
    if (!modal) return;
    
    // 重置表单
    document.getElementById('article-form').reset();
    document.getElementById('article-id').value = '';
    document.getElementById('selected-tags').innerHTML = '';
    selectedArticleTags = [];
    editingArticleId = null;
    
    if (article) {
        // 编辑模式
        title.textContent = '✏️ 编辑文章';
        editingArticleId = article.id;
        document.getElementById('article-id').value = article.id;
        document.getElementById('article-title-input').value = article.title || '';
        document.getElementById('article-category-input').value = article.category || 'other';
        document.getElementById('article-cover-input').value = article.cover || '';
        document.getElementById('article-summary-input').value = article.summary || '';
        document.getElementById('article-content-input').value = article.content || '';
        
        // 恢复标签
        if (article.tags && article.tags.length > 0) {
            selectedArticleTags = [...article.tags];
            renderSelectedTags();
        }
    } else {
        // 新建模式
        title.textContent = '✍️ 发布文章';
    }
    
    modal.style.display = 'flex';
    document.getElementById('editor-error').style.display = 'none';
}

// 关闭文章编辑器
function closeArticleEditor() {
    const modal = document.getElementById('article-editor-modal');
    if (modal) modal.style.display = 'none';
}

// 添加标签
function addTag(tagId) {
    if (!tagId || selectedArticleTags.includes(tagId)) {
        document.getElementById('tag-selector').value = '';
        return;
    }
    
    if (selectedArticleTags.length >= 5) {
        showToast('最多选择5个标签', 'error');
        document.getElementById('tag-selector').value = '';
        return;
    }
    
    selectedArticleTags.push(tagId);
    renderSelectedTags();
    document.getElementById('tag-selector').value = '';
}

// 移除标签
function removeTag(tagId) {
    selectedArticleTags = selectedArticleTags.filter(t => t !== tagId);
    renderSelectedTags();
}

// 渲染已选标签
function renderSelectedTags() {
    const container = document.getElementById('selected-tags');
    if (!container) return;
    
    container.innerHTML = selectedArticleTags.map(tagId => {
        const tag = articleTags.find(t => t.id === tagId);
        if (!tag) return '';
        return `
            <span class="selected-tag" style="background: ${tag.color}">
                ${tag.name}
                <button type="button" onclick="removeTag('${tagId}')">&times;</button>
            </span>
        `;
    }).join('');
}

// 保存文章
async function saveArticle(status) {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const title = document.getElementById('article-title-input').value.trim();
    const content = document.getElementById('article-content-input').value.trim();
    const category = document.getElementById('article-category-input').value;
    const cover = document.getElementById('article-cover-input').value.trim();
    const summary = document.getElementById('article-summary-input').value.trim();
    const errorEl = document.getElementById('editor-error');
    
    if (!title) {
        errorEl.textContent = '请输入文章标题';
        errorEl.style.display = 'block';
        return;
    }
    
    if (!content) {
        errorEl.textContent = '请输入文章内容';
        errorEl.style.display = 'block';
        return;
    }
    
    const articleData = {
        title,
        content,
        category,
        cover,
        summary,
        tags: selectedArticleTags,
        status
    };
    
    try {
        let url = `${API_BASE}/api/articles`;
        let method = 'POST';
        
        if (editingArticleId) {
            url = `${API_BASE}/api/articles/${editingArticleId}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify(articleData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeArticleEditor();
            loadArticles(1);
            showToast(data.message || '操作成功');
            
            // 如果是从详情页编辑的，关闭详情页
            closeArticleDetail();
        } else {
            errorEl.textContent = data.message || '保存失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        console.error('保存文章失败:', error);
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
    }
}

// 编辑文章
async function editArticle(articleId) {
    try {
        const response = await fetch(`${API_BASE}/api/articles/${articleId}`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        const data = await response.json();
        
        if (data.success) {
            closeArticleDetail();
            showArticleEditor(data.article);
        } else {
            showToast(data.message || '获取文章失败', 'error');
        }
    } catch (error) {
        console.error('获取文章失败:', error);
        showToast('网络错误，请稍后重试', 'error');
    }
}

// 删除文章
async function deleteArticle(articleId) {
    if (!confirm('确定要删除这篇文章吗？此操作不可撤销。')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/articles/${articleId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeArticleDetail();
            loadArticles(articlesData.pagination.page);
            showToast('文章已删除');
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除文章失败:', error);
        showToast('网络错误，请稍后重试', 'error');
    }
}

// 用户加热自己的文章
async function heatMyArticle(articleId) {
    if (!userToken) {
        showLoginModal();
        return;
    }
    
    // 获取加热配置
    let config = { costPerHour: 10, minHours: 1, maxHours: 72 };
    try {
        const configRes = await fetch(`${API_BASE}/api/heat/config`);
        const configData = await configRes.json();
        if (configData.success && configData.config) {
            config = configData.config;
        }
    } catch (e) {}
    
    // 弹窗选择加热时长
    showHeatModal(articleId, config);
}

// 显示加热选项弹窗
function showHeatModal(articleId, config) {
    const existingModal = document.getElementById('heat-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'heat-modal';
    modal.className = 'modal-overlay';
    
    // 转义 articleId 以防包含特殊字符
    const safeArticleId = articleId.replace(/'/g, "\\'");
    
    modal.innerHTML = `
        <div class="heat-modal-content">
            <div class="heat-modal-header">
                <h3>🔥 加热文章</h3>
                <button class="modal-close-btn" onclick="closeHeatModal()">×</button>
            </div>
            <div class="heat-modal-body">
                <p class="heat-tip">加热后文章将在列表中优先展示，标题显示金色闪光效果</p>
                <div class="heat-options">
                    <button class="heat-option" onclick="confirmHeat('${safeArticleId}', 6, ${config.costPerHour * 6})">
                        <span class="heat-duration">6小时</span>
                        <span class="heat-cost">${config.costPerHour * 6} 积分</span>
                    </button>
                    <button class="heat-option heat-option-popular" onclick="confirmHeat('${safeArticleId}', 12, ${config.costPerHour * 12})">
                        <span class="popular-badge">推荐</span>
                        <span class="heat-duration">12小时</span>
                        <span class="heat-cost">${config.costPerHour * 12} 积分</span>
                    </button>
                    <button class="heat-option" onclick="confirmHeat('${safeArticleId}', 24, ${config.costPerHour * 24})">
                        <span class="heat-duration">24小时</span>
                        <span class="heat-cost">${config.costPerHour * 24} 积分</span>
                    </button>
                    <button class="heat-option" onclick="confirmHeat('${safeArticleId}', 48, ${config.costPerHour * 48})">
                        <span class="heat-duration">48小时</span>
                        <span class="heat-cost">${config.costPerHour * 48} 积分</span>
                    </button>
                </div>
                <div class="heat-custom">
                    <label for="heat-custom-hours">自定义时长（${config.minHours}-${config.maxHours}小时）</label>
                    <div class="heat-custom-input">
                        <input type="number" id="heat-custom-hours" min="${config.minHours}" max="${config.maxHours}" value="24">
                        <span>小时</span>
                        <span class="heat-custom-cost">= <span id="heat-custom-price">${config.costPerHour * 24}</span> 积分</span>
                    </div>
                    <button class="btn-heat-confirm" onclick="confirmCustomHeat('${safeArticleId}', ${config.costPerHour})">确认加热</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 点击遮罩层关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeHeatModal();
        }
    });
    
    // 监听自定义时长输入
    const customInput = document.getElementById('heat-custom-hours');
    const customPrice = document.getElementById('heat-custom-price');
    if (customInput && customPrice) {
        customInput.addEventListener('input', () => {
            const hours = parseInt(customInput.value) || 0;
            customPrice.textContent = hours * config.costPerHour;
        });
    }
}

function closeHeatModal() {
    const modal = document.getElementById('heat-modal');
    if (modal) modal.remove();
}

// 确认加热（快捷选项）
async function confirmHeat(articleId, hours, cost) {
    if (!confirm(`确定消耗 ${cost} 积分加热 ${hours} 小时吗？`)) return;
    await executeHeat(articleId, hours);
}

// 确认加热（自定义时长）
async function confirmCustomHeat(articleId, costPerHour) {
    const customInput = document.getElementById('heat-custom-hours');
    const hours = parseInt(customInput.value);
    
    if (isNaN(hours) || hours < 1) {
        showToast('请输入有效的小时数', 'error');
        return;
    }
    
    const cost = hours * costPerHour;
    if (!confirm(`确定消耗 ${cost} 积分加热 ${hours} 小时吗？`)) return;
    await executeHeat(articleId, hours);
}

// 执行加热
async function executeHeat(articleId, hours) {
    try {
        // 确保hours是数字类型
        const hoursNum = parseInt(hours);
        if (isNaN(hoursNum) || hoursNum < 1) {
            showToast('请输入有效的小时数', 'error');
            return;
        }
        
        const response = await fetch(`${API_BASE}/api/articles/heat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ articleId, hours: hoursNum })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // 检查是否是封禁或未授权
            if (response.status === 401 || response.status === 403) {
                handleUserBanned();
                return;
            }
        }
        
        if (data.success) {
            closeHeatModal();
            closeArticleDetail();
            showToast(`🔥 ${data.message}`);
            loadArticles(1); // 刷新文章列表
            loadUserStats(); // 刷新用户积分
        } else {
            showToast(data.message || '加热失败', 'error');
        }
    } catch (error) {
        console.error('加热文章失败:', error);
        showToast('网络错误，请稍后重试', 'error');
    }
}

// 显示我的文章
async function showMyArticles(status = 'published') {
    closeUserMenu();
    
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const modal = document.getElementById('my-articles-modal');
    const title = document.getElementById('my-articles-title');
    const container = document.getElementById('my-articles-container');
    
    if (!modal || !container) return;
    
    modal.style.display = 'block';
    title.textContent = status === 'draft' ? '📋 我的草稿' : '📝 我的文章';
    
    // 更新标签页状态
    document.querySelectorAll('.my-articles-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.my-articles-tabs .tab-btn:${status === 'draft' ? 'last-child' : 'first-child'}`)?.classList.add('active');
    
    container.innerHTML = `
        <div class="article-loading">
            <span class="loading-spinner"></span>
            <p>正在加载...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/api/articles/my/list?status=${status}`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.articles.length === 0) {
                container.innerHTML = `
                    <div class="article-empty">
                        <div class="article-empty-icon">${status === 'draft' ? '📋' : '📝'}</div>
                        <p>暂无${status === 'draft' ? '草稿' : '文章'}</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = data.articles.map(article => `
                <div class="my-article-item">
                    <div class="my-article-info">
                        <div class="my-article-title">${escapeHtml(article.title)}</div>
                        <div class="my-article-meta">
                            <span class="my-article-status ${article.status}">${article.status === 'published' ? '已发布' : '草稿'}</span>
                            <span>👁️ ${article.views || 0}</span>
                            <span>📅 ${formatDate(article.updatedAt).split(' ')[0]}</span>
                        </div>
                    </div>
                    <div class="my-article-actions">
                        <button onclick="viewMyArticle('${article.id}')" title="查看">👁️</button>
                        <button onclick="editMyArticle('${article.id}')" title="编辑">✏️</button>
                        <button class="delete-btn" onclick="deleteMyArticle('${article.id}')" title="删除">🗑️</button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="article-empty">
                    <div class="article-empty-icon">❌</div>
                    <p>${data.message || '加载失败'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('加载我的文章失败:', error);
        container.innerHTML = `
            <div class="article-empty">
                <div class="article-empty-icon">❌</div>
                <p>网络错误，请稍后重试</p>
            </div>
        `;
    }
}

// 切换我的文章标签页
function switchMyArticlesTab(status) {
    showMyArticles(status);
}

// 关闭我的文章
function closeMyArticles() {
    const modal = document.getElementById('my-articles-modal');
    if (modal) modal.style.display = 'none';
}

// 查看我的文章
function viewMyArticle(articleId) {
    closeMyArticles();
    showArticleDetail(articleId);
}

// 编辑我的文章
async function editMyArticle(articleId) {
    closeMyArticles();
    await editArticle(articleId);
}

// 删除我的文章
async function deleteMyArticle(articleId) {
    if (!confirm('确定要删除这篇文章吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/articles/${articleId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('文章已删除');
            // 刷新当前标签页
            const activeTab = document.querySelector('.my-articles-tabs .tab-btn.active');
            const status = activeTab?.textContent.includes('草稿') ? 'draft' : 'published';
            showMyArticles(status);
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除文章失败:', error);
        showToast('网络错误，请稍后重试', 'error');
    }
}

// Markdown 工具栏操作
function insertMarkdown(type) {
    const textarea = document.getElementById('article-content-input');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    let insert = '';
    let cursorOffset = 0;
    
    switch (type) {
        case 'bold':
            insert = `**${selected || '粗体文字'}**`;
            cursorOffset = selected ? insert.length : 2;
            break;
        case 'italic':
            insert = `*${selected || '斜体文字'}*`;
            cursorOffset = selected ? insert.length : 1;
            break;
        case 'heading':
            insert = `\n## ${selected || '标题'}\n`;
            cursorOffset = selected ? insert.length : 4;
            break;
        case 'link':
            insert = `[${selected || '链接文字'}](url)`;
            cursorOffset = selected ? insert.length - 5 : 1;
            break;
        case 'image':
            insert = `![${selected || '图片描述'}](图片URL)`;
            cursorOffset = selected ? insert.length - 6 : 2;
            break;
        case 'code':
            insert = selected.includes('\n') ? `\n\`\`\`\n${selected || '代码'}\n\`\`\`\n` : `\`${selected || '代码'}\``;
            cursorOffset = selected ? insert.length : 1;
            break;
        case 'quote':
            insert = `\n> ${selected || '引用内容'}\n`;
            cursorOffset = selected ? insert.length : 2;
            break;
        case 'list':
            insert = `\n- ${selected || '列表项'}\n`;
            cursorOffset = selected ? insert.length : 2;
            break;
    }
    
    textarea.value = text.substring(0, start) + insert + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载完成后初始化文章系统
document.addEventListener('DOMContentLoaded', () => {
    // 初始化用户认证
    initUserAuth();
    
    // 加载文章分类和标签
    loadArticleCategories();
    loadArticleTags();
    
    // 加载文章列表
    setTimeout(() => {
        loadArticles(1);
    }, 100);
    
    // 点击弹窗外部关闭
    document.getElementById('login-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('auth-modal')) closeLoginModal();
    });
    
    document.getElementById('register-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('auth-modal')) closeRegisterModal();
    });
    
    document.getElementById('user-profile-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('auth-modal')) closeUserProfile();
    });
    
    document.getElementById('article-detail-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('detail-modal')) closeArticleDetail();
    });
    
    document.getElementById('my-articles-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('my-articles-modal')) closeMyArticles();
    });
});

// ==================== 用户个人主页 ====================

// 显示作者主页
async function showAuthorPage(authorId) {
    const modal = document.getElementById('author-page-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // 显示加载状态
    document.getElementById('author-page-name').textContent = '加载中...';
    document.getElementById('author-page-bio').textContent = '';
    document.getElementById('author-page-avatar').src = 'https://via.placeholder.com/80';
    document.getElementById('author-articles-container').innerHTML = `
        <div class="article-loading">
            <span class="loading-spinner"></span>
            <p>正在加载...</p>
        </div>
    `;
    
    try {
        // 获取用户信息
        const userResponse = await fetch(`${API_BASE}/api/user/public/${authorId}`);
        const userData = await userResponse.json();
        
        if (userData.success && userData.user) {
            const user = userData.user;
            document.getElementById('author-page-name').textContent = user.nickname || '匿名用户';
            document.getElementById('author-page-bio').textContent = user.bio || '这个人很懒，什么都没写~';
            const authorAvatarUrl = safeImageSrc(user.avatar, generateRandomAvatar(user.email || user.id), user.email || user.id);
            const authorAvatarEl = document.getElementById('author-page-avatar');
            if (authorAvatarEl) {
                authorAvatarEl.src = authorAvatarUrl;
                setupImageErrorHandler(authorAvatarEl, generateRandomAvatar(user.email || user.id), user.email || user.id);
            }
            document.getElementById('author-join-date').textContent = `加入于 ${formatDate(user.createdAt).split(' ')[0]}`;
        }
        
        // 获取作者的文章
        const articlesResponse = await fetch(`${API_BASE}/api/articles?authorId=${authorId}&limit=50`);
        const articlesData = await articlesResponse.json();
        
        if (articlesData.success) {
            const articles = articlesData.articles;
            document.getElementById('author-article-count').textContent = `${articles.length} 篇文章`;
            
            if (articles.length === 0) {
                document.getElementById('author-articles-container').innerHTML = `
                    <div class="article-empty">
                        <div class="article-empty-icon">📝</div>
                        <p>暂无文章</p>
                    </div>
                `;
            } else {
                document.getElementById('author-articles-container').innerHTML = articles.map(article => `
                    <div class="my-article-item" onclick="closeAuthorPage(); showArticleDetail('${article.id}')">
                        <div class="my-article-info">
                            <h4 class="my-article-title">${escapeHtml(article.title)}</h4>
                            <p class="my-article-summary">${escapeHtml(article.summary || '')}</p>
                            <div class="my-article-meta">
                                <span>👁️ ${article.views || 0}</span>
                                <span>📅 ${formatDate(article.publishedAt || article.createdAt).split(' ')[0]}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('加载作者主页失败:', error);
        document.getElementById('author-articles-container').innerHTML = `
            <div class="article-empty">
                <div class="article-empty-icon">❌</div>
                <p>加载失败</p>
            </div>
        `;
    }
}

// 关闭作者主页
function closeAuthorPage() {
    const modal = document.getElementById('author-page-modal');
    if (modal) modal.style.display = 'none';
}

// ==================== 后台用户管理 ====================

// 加载注册用户列表
async function loadForumUsers() {
    const tbody = document.getElementById('forum-users-tbody');
    if (!tbody) return;
    
    try {
        const data = await apiRequest('/api/admin/forum-users');
        
        if (!data.users || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state-text">暂无注册用户</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.users.map(user => `
            <tr class="${user.verified ? 'row-verified' : ''} ${user.vip ? 'row-vip' : ''}">
                <td>
                    <img src="${user.avatar || generateRandomAvatar(user.email)}" 
                         alt="${user.nickname}" 
                         style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                </td>
                <td>
                    <strong class="${user.verified ? 'golden-text' : ''}">${escapeHtml(user.nickname)}</strong>
                    ${user.verified ? '<span class="verified-mark">✓</span>' : ''}
                    ${user.vip ? `<span class="vip-mark">${user.vip.level}</span>` : ''}
                </td>
                <td>${escapeHtml(user.email)}</td>
                <td>
                    <span class="user-coins">💰 ${user.coins || 0}</span>
                    <span class="user-level">Lv.${user.level || 1}</span>
                </td>
                <td>${formatDate(user.createdAt)}</td>
                <td>
                    <span class="status-badge ${user.status === 'active' ? 'status-active' : 'status-banned'}">
                        ${user.status === 'active' ? '正常' : '已禁用'}
                    </span>
                </td>
                <td>
                    <button class="btn-small ${user.verified ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleUserVerify('${user.id}', ${!user.verified})">
                        ${user.verified ? '取消认证' : '金V认证'}
                    </button>
                </td>
                <td>
                    <button class="btn-small ${user.vip ? 'btn-warning' : 'btn-primary'}" 
                            onclick="manageUserVip('${user.id}', ${!!user.vip})">
                        ${user.vip ? '取消VIP' : '授予VIP'}
                    </button>
                </td>
                <td>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button class="btn-small btn-info" onclick="manageUserCoins('${user.id}')">积分</button>
                        <button class="btn-small ${user.status === 'active' ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleUserStatus('${user.id}', '${user.status === 'active' ? 'banned' : 'active'}')">
                            ${user.status === 'active' ? '禁用' : '启用'}
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteForumUser('${user.id}')">删除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载用户列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state-text">加载失败</td></tr>';
    }
}

// 切换用户金V认证
async function toggleUserVerify(userId, verified) {
    const confirmMsg = verified ? '确定授予此用户金V认证吗？' : '确定取消此用户的金V认证吗？';
    if (!confirm(confirmMsg)) return;
    
    try {
        await apiRequest(`/api/admin/forum-users/${userId}/verify`, {
            method: 'POST',
            body: JSON.stringify({ verified })
        });
        showMessage('forum-users-message', verified ? '已授予金V认证' : '已取消金V认证', 'success');
        loadForumUsers();
    } catch (error) {
        showMessage('forum-users-message', error.message || '操作失败', 'error');
    }
}

// 管理用户VIP
async function manageUserVip(userId, hasVip) {
    if (hasVip) {
        if (!confirm('确定取消此用户的VIP吗？')) return;
        try {
            await apiRequest(`/api/admin/forum-users/${userId}/vip`, {
                method: 'POST',
                body: JSON.stringify({ level: null })
            });
            showMessage('forum-users-message', 'VIP已取消', 'success');
            loadForumUsers();
        } catch (error) {
            showMessage('forum-users-message', error.message || '操作失败', 'error');
        }
    } else {
        const level = prompt('请输入VIP等级（如 VIP1, VIP2, SVIP）：', 'VIP1');
        if (!level) return;
        
        const expireInput = prompt('请输入有效期：\n1) 输入天数（如 30 表示30天）\n2) 输入日期（如 2025-12-31）\n3) 留空表示永久', '30');
        if (expireInput === null) return;
        
        let expireAt = null;
        if (expireInput.trim() !== '') {
            // 判断是数字（天数）还是日期字符串
            const days = parseInt(expireInput);
            if (!isNaN(days) && days > 0) {
                // 是天数，计算到期日期
                const now = new Date();
                now.setDate(now.getDate() + days);
                expireAt = now.toISOString().split('T')[0]; // 格式：YYYY-MM-DD
            } else {
                // 是日期字符串，直接使用（但要验证格式）
                if (/^\d{4}-\d{2}-\d{2}$/.test(expireInput.trim())) {
                    expireAt = expireInput.trim();
                } else {
                    alert('日期格式不正确，请使用 YYYY-MM-DD 格式');
                    return;
                }
            }
        }
        
        try {
            await apiRequest(`/api/admin/forum-users/${userId}/vip`, {
                method: 'POST',
                body: JSON.stringify({ level, expireAt })
            });
            const expireText = expireAt ? `，有效期至 ${expireAt}` : '（永久）';
            showMessage('forum-users-message', `VIP已授予${expireText}`, 'success');
            loadForumUsers();
        } catch (error) {
            showMessage('forum-users-message', error.message || '操作失败', 'error');
        }
    }
}

// 管理用户积分
async function manageUserCoins(userId) {
    const action = prompt('输入正数增加积分，负数扣除积分：', '100');
    if (action === null) return;
    
    const amount = parseInt(action);
    if (isNaN(amount)) {
        alert('请输入有效的数字');
        return;
    }
    
    try {
        const result = await apiRequest(`/api/admin/forum-users/${userId}/coins`, {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
        showMessage('forum-users-message', `操作成功，当前余额: ${result.newBalance}`, 'success');
        loadForumUsers();
    } catch (error) {
        showMessage('forum-users-message', error.message || '操作失败', 'error');
    }
}

// 切换用户状态
async function toggleUserStatus(userId, newStatus) {
    const confirmMsg = newStatus === 'banned' ? '确定要禁用此用户吗？' : '确定要启用此用户吗？';
    if (!confirm(confirmMsg)) return;
    
    try {
        await apiRequest(`/api/admin/forum-users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        showMessage('forum-users-message', '用户状态更新成功', 'success');
        loadForumUsers();
    } catch (error) {
        showMessage('forum-users-message', error.message || '操作失败', 'error');
    }
}

// 删除用户
async function deleteForumUser(userId) {
    if (!confirm('确定要删除此用户吗？此操作不可恢复！')) return;
    
    try {
        await apiRequest(`/api/admin/forum-users/${userId}`, {
            method: 'DELETE'
        });
        showMessage('forum-users-message', '用户删除成功', 'success');
        loadForumUsers();
    } catch (error) {
        showMessage('forum-users-message', error.message || '删除失败', 'error');
    }
}

// ==================== 后台文章管理 ====================

// 加载文章列表
async function loadForumArticles() {
    const tbody = document.getElementById('forum-articles-tbody');
    if (!tbody) return;
    
    try {
        const statusFilter = document.getElementById('article-status-filter')?.value || '';
        let url = '/api/admin/forum-articles';
        if (statusFilter) url += `?status=${statusFilter}`;
        
        const data = await apiRequest(url);
        
        if (!data.articles || data.articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state-text">暂无文章</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.articles.map(article => {
            const hasHot = article.tags && article.tags.includes('hot');
            const hasRecommend = article.tags && article.tags.includes('recommend');
            const isHeated = article.isHeated;
            const isPinned = article.isPinned;
            
            // 计算加热剩余时间
            let heatInfo = '';
            if (isHeated && article.heatExpireAt) {
                const remaining = new Date(article.heatExpireAt) - new Date();
                if (remaining > 0) {
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    heatInfo = `剩${hours}h`;
                }
            }
            
            return `
                <tr class="${isHeated ? 'row-heated' : ''} ${isPinned ? 'row-pinned' : ''}">
                    <td><strong class="${isHeated ? 'golden-text' : ''}">${escapeHtml(article.title)}</strong></td>
                    <td>${escapeHtml(article.authorName)} <br><small>${escapeHtml(article.authorEmail)}</small></td>
                    <td>${article.category}</td>
                    <td>
                        <span class="status-badge ${article.status === 'published' ? 'status-active' : 'status-draft'}">
                            ${article.status === 'published' ? '已发布' : '草稿'}
                        </span>
                    </td>
                    <td>${article.views || 0}</td>
                    <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            <button class="btn-tag ${hasHot ? 'btn-tag-active' : ''}" 
                                    onclick="toggleArticleTag('${article.id}', 'hot', ${hasHot})">
                                🔥 火爆
                            </button>
                            <button class="btn-tag ${hasRecommend ? 'btn-tag-active' : ''}" 
                                    onclick="toggleArticleTag('${article.id}', 'recommend', ${hasRecommend})">
                                📌 推荐
                            </button>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                            <button class="btn-small ${isHeated ? 'btn-warning' : 'btn-success'}" 
                                    onclick="adminHeatArticle('${article.id}', ${isHeated})">
                                ${isHeated ? '🔥 取消加热' : '🔥 加热'}
                            </button>
                            ${heatInfo ? `<span style="font-size: 0.7rem; color: #ffd700;">${heatInfo}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <button class="btn-small ${isPinned ? 'btn-danger' : 'btn-primary'}" 
                                onclick="adminPinArticle('${article.id}', ${isPinned})">
                            ${isPinned ? '📌 取消置顶' : '📌 置顶'}
                        </button>
                    </td>
                    <td>${formatDate(article.publishedAt || article.createdAt)}</td>
                    <td>
                        <button class="btn-small btn-danger" onclick="deleteForumArticle('${article.id}')">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('加载文章列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state-text">加载失败</td></tr>';
    }
}

// 管理员加热文章
async function adminHeatArticle(articleId, isCurrentlyHeated) {
    let hours = 0;
    if (!isCurrentlyHeated) {
        const input = prompt('请输入加热时长（小时）：', '24');
        if (input === null) return;
        hours = parseInt(input);
        if (isNaN(hours) || hours < 1) {
            alert('请输入有效的小时数');
            return;
        }
    }
    
    try {
        await apiRequest(`/api/admin/forum-articles/${articleId}/heat`, {
            method: 'POST',
            body: JSON.stringify({ hours })
        });
        showMessage('forum-articles-message', hours > 0 ? `文章加热${hours}小时成功` : '已取消加热', 'success');
        loadForumArticles();
    } catch (error) {
        showMessage('forum-articles-message', error.message || '操作失败', 'error');
    }
}

// 管理员置顶文章
async function adminPinArticle(articleId, isCurrentlyPinned) {
    try {
        await apiRequest(`/api/admin/forum-articles/${articleId}/pin`, {
            method: 'POST',
            body: JSON.stringify({ isPinned: !isCurrentlyPinned })
        });
        showMessage('forum-articles-message', !isCurrentlyPinned ? '文章已置顶' : '已取消置顶', 'success');
        loadForumArticles();
    } catch (error) {
        showMessage('forum-articles-message', error.message || '操作失败', 'error');
    }
}

// 切换文章标签（火爆/推荐）
async function toggleArticleTag(articleId, tagType, currentlyHas) {
    try {
        // 先获取文章当前标签
        const data = await apiRequest('/api/admin/forum-articles');
        const article = data.articles.find(a => a.id === articleId);
        if (!article) return;
        
        let tags = article.tags || [];
        
        if (currentlyHas) {
            // 移除标签
            tags = tags.filter(t => t !== tagType);
        } else {
            // 添加标签
            if (!tags.includes(tagType)) {
                tags.push(tagType);
            }
        }
        
        await apiRequest(`/api/admin/forum-articles/${articleId}/tags`, {
            method: 'PUT',
            body: JSON.stringify({ tags })
        });
        
        showMessage('forum-articles-message', '标签更新成功', 'success');
        loadForumArticles();
    } catch (error) {
        showMessage('forum-articles-message', error.message || '操作失败', 'error');
    }
}

// 删除文章
async function deleteForumArticle(articleId) {
    if (!confirm('确定要删除此文章吗？')) return;
    
    try {
        await apiRequest(`/api/admin/forum-articles/${articleId}`, {
            method: 'DELETE'
        });
        showMessage('forum-articles-message', '文章删除成功', 'success');
        loadForumArticles();
    } catch (error) {
        showMessage('forum-articles-message', error.message || '删除失败', 'error');
    }
}

// 加载推送配置
async function loadPushConfig() {
    try {
        const data = await apiRequest('/api/admin/push-config');
        if (data.config) {
            document.getElementById('push-hot-threshold').value = data.config.hotThreshold || 100;
            document.getElementById('push-recommend-count').value = data.config.recommendCount || 3;
        }
    } catch (error) {
        console.error('加载推送配置失败:', error);
    }
}

// 保存推送配置
async function savePushConfig(event) {
    event.preventDefault();
    
    const config = {
        hotThreshold: parseInt(document.getElementById('push-hot-threshold').value) || 100,
        recommendCount: parseInt(document.getElementById('push-recommend-count').value) || 3
    };
    
    try {
        await apiRequest('/api/admin/push-config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
        showMessage('push-config-message', '推送配置保存成功', 'success');
    } catch (error) {
        showMessage('push-config-message', error.message || '保存失败', 'error');
    }
}


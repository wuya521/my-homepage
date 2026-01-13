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
        }

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
            if (contentEl) contentEl.textContent = announcement.content || '';
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
    
    // 支持HTML格式
    content.innerHTML = popupAd.content || '';
    
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

// 加载门户链接
async function loadPortals() {
    try {
        const portals = await apiRequest('/api/portals');
        const container = document.getElementById('portals-container');
        
        if (!container) return;

        if (portals.length === 0) {
            container.innerHTML = '<p class="empty-state-text">暂无门户链接</p>';
            return;
        }

        container.innerHTML = portals.map(portal => `
            <a href="${portal.url}" target="_blank" class="portal-card ${portal.pinned ? 'pinned' : ''}">
                ${portal.pinned ? '<span class="pinned-badge">置顶</span>' : ''}
                <div class="portal-icon">${portal.icon || '🔗'}</div>
                <div class="portal-info">
                    <h3 class="portal-name">${portal.name}</h3>
                    <p class="portal-desc">${portal.description || ''}</p>
                </div>
            </a>
        `).join('');
    } catch (error) {
        console.error('加载门户链接失败:', error);
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

// VIP 状态查询
async function handleVipCheckSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('vip-check-email');
    const email = emailInput.value.trim();

    try {
        const result = await apiRequest(`/api/vip/check?email=${encodeURIComponent(email)}`);
        
        if (result.isVip) {
            showMessage('vip-status-message', 
                `您是 ${result.level} 会员，到期时间：${formatDate(result.expiryDate)}`, 
                'success');
        } else {
            showMessage('vip-status-message', '该邮箱尚未开通 VIP 会员', 'info');
        }
    } catch (error) {
        showMessage('vip-status-message', error.message, 'error');
    }
}

// VIP 购买弹窗
function showVipPurchase(level, price) {
    const modal = document.getElementById('vip-modal');
    const levelEl = document.getElementById('modal-vip-level');
    const priceEl = document.getElementById('modal-vip-price');
    
    if (modal) modal.style.display = 'flex';
    if (levelEl) levelEl.textContent = level;
    if (priceEl) priceEl.textContent = price;
}

function closeVipModal() {
    const modal = document.getElementById('vip-modal');
    if (modal) modal.style.display = 'none';
    
    const form = document.getElementById('vip-purchase-form');
    if (form) form.reset();
    
    const messageEl = document.getElementById('purchase-message');
    if (messageEl) messageEl.style.display = 'none';
}

// VIP 购买提交（演示功能）
async function handleVipPurchaseSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('purchase-email').value.trim();
    const name = document.getElementById('purchase-name').value.trim();
    const level = document.getElementById('modal-vip-level').textContent;
    
    // 这里只是演示，实际需要接入支付系统
    showMessage('purchase-message', 
        `感谢 ${name} 的购买！实际使用时，请接入支付系统完成支付流程。`, 
        'info');
    
    setTimeout(() => {
        closeVipModal();
    }, 3000);
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
    const portal = {
        id: index || Date.now().toString(),
        name: document.getElementById('portal-name').value.trim(),
        url: document.getElementById('portal-url').value.trim(),
        icon: document.getElementById('portal-icon').value.trim(),
        description: document.getElementById('portal-description').value.trim(),
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

        const passwordForm = document.getElementById('password-form');
        if (passwordForm) passwordForm.addEventListener('submit', handlePasswordSubmit);

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

        // 兑换码表单
        const redeemForm = document.getElementById('redeem-form');
        if (redeemForm) {
            redeemForm.addEventListener('submit', handleRedeemSubmit);
        }

        // VIP 查询表单
        const vipCheckForm = document.getElementById('vip-check-form');
        if (vipCheckForm) {
            vipCheckForm.addEventListener('submit', handleVipCheckSubmit);
        }

        // VIP 购买表单
        const vipPurchaseForm = document.getElementById('vip-purchase-form');
        if (vipPurchaseForm) {
            vipPurchaseForm.addEventListener('submit', handleVipPurchaseSubmit);
        }

        // 兑换码输入格式化（自动添加横线）并检查可选内容
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


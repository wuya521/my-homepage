# 🏠 个人主页项目

一个功能完整的个人主页系统，使用纯原生 HTML、CSS、JavaScript 构建，基于 Cloudflare Workers + KV 存储，无需服务器，完全免费部署。

## ✨ 项目特色

- 🎨 **现代化设计** - 精美的渐变效果、流畅的动画、响应式布局
- 💎 **功能完整** - 个人展示、公告系统、门户链接、VIP会员、兑换码、黄V认证
- 🔐 **后台管理** - 强大的管理系统，所有内容可视化编辑
- ⚡ **极速加载** - 纯原生代码，零依赖，性能卓越
- 🌐 **免费部署** - 基于 Cloudflare 免费服务，无需任何成本
- 📱 **完美适配** - 支持手机、平板、桌面等各种设备

## 🌟 功能列表

### 前端展示页面
- ✅ 个人信息卡片（头像、姓名、简介、社交链接）
- ✅ 黄V认证标识
- ✅ VIP会员标识
- ✅ 公告系统（可启用/禁用）
- ✅ 门户链接展示（快速访问）
- ✅ 兑换码激活系统
- ✅ VIP会员购买展示
- ✅ VIP状态查询

### 后台管理系统
- ✅ 安全登录认证
- ✅ 个人资料编辑
- ✅ 公告管理
- ✅ 门户链接管理（增删改查）
- ✅ 兑换码生成与管理
- ✅ VIP用户管理
- ✅ 黄V认证管理
- ✅ 密码修改

## 📸 预览

### 主页展示
- 精美的个人信息卡片
- 星空背景动画效果
- 流畅的交互体验

### 后台管理
- 现代化的管理界面
- 侧边栏导航
- 完整的数据管理功能

## 🚀 部署教程

### 📋 准备工作

1. 一个 [Cloudflare](https://www.cloudflare.com/) 账户（免费）
2. 一个 [GitHub](https://github.com/) 账户（可选，用于 Pages 部署）

### 第一步：部署后端服务（Cloudflare Workers）

#### 方式 A：使用 Wrangler CLI 部署（推荐）

1. **安装 Node.js**（如果还没有）
   - 下载：https://nodejs.org/
   - 选择 LTS 版本

2. **克隆或下载本项目**
   ```bash
   git clone https://github.com/wuya521/my-homepage.git
   cd my-homepage
   ```

3. **创建 wrangler.toml 配置文件**
   
   在项目根目录创建 `wrangler.toml`：
   ```toml
   name = "my-homepage"
   main = "worker.js"
   compatibility_date = "2026-01-12"
   workers_dev = true
   account_id = "你的Account-ID"
   
   [[kv_namespaces]]
   binding = "MY_HOME_KV"
   id = "你的KV-Namespace-ID"
   ```

4. **获取 Account ID**
   ```bash
   npx wrangler login
   npx wrangler whoami
   ```
   复制显示的 Account ID

5. **创建 KV Namespace**
   ```bash
   npx wrangler kv:namespace create MY_HOME_KV
   ```
   复制返回的 `id`

6. **更新 wrangler.toml**
   - 将 Account ID 填入 `account_id`
   - 将 KV Namespace ID 填入 `id`

7. **部署 Worker**
   ```bash
   npx wrangler deploy
   ```
   成功后会显示 Worker URL，例如：`https://my-homepage.your-subdomain.workers.dev`

#### 方式 B：手动在 Dashboard 部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧菜单 **"Workers 和 Pages"**
3. 点击 **"创建应用程序"** → **"创建 Worker"**
4. 为 Worker 命名（例如：`my-homepage-api`）
5. 点击 **"部署"**
6. 部署完成后，点击 **"编辑代码"**
7. 将项目中的 `worker.js` 文件内容完整复制到编辑器中
8. 点击右上角 **"保存并部署"**
9. **重要：记录下你的 Worker 域名**（格式：`https://your-worker-name.your-subdomain.workers.dev`）

### 第二步：配置 KV 数据库

**如果使用 Wrangler 部署，此步骤已完成**，跳到第三步。

**如果使用手动部署，按以下步骤操作：**

#### 2.1 创建 KV 命名空间

1. 在 Cloudflare Dashboard 中，点击 **"Workers 和 Pages"** → **"KV"**
2. 点击 **"创建命名空间"**
3. 输入命名空间名称：`home_kv`
4. 点击 **"添加"**

#### 2.2 绑定 KV 到 Worker

1. 返回到你的 Worker 页面
2. 点击 **"设置"** 标签
3. 找到 **"变量"** 部分
4. 在 **"KV 命名空间绑定"** 区域，点击 **"添加绑定"**
5. 配置绑定：
   - **变量名：** `MY_HOME_KV`（必须完全一致，大小写敏感）
   - **KV 命名空间：** 选择刚创建的 `home_kv`
6. 点击 **"保存并部署"**

> ⚠️ **重要提示**：变量名必须是 `MY_HOME_KV`，否则会报错"未授权访问"

### 第三步：部署前端页面

#### 方式一：使用 Cloudflare Pages（推荐）

##### 3.1 准备代码仓库

1. Fork 本项目到你的 GitHub 账户，或创建新仓库上传项目文件
2. **重要：修改配置文件**
   
   编辑 `static/script.js` 文件，找到第 3 行：
   ```javascript
   const API_BASE = window.API_BASE || 'https://your-worker-domain.workers.dev';
   ```
   
   将 `https://your-worker-domain.workers.dev` 替换为你在第一步中获得的 Worker 域名

   同样，编辑 `manage.html` 文件，找到：
   ```javascript
   const API_BASE = 'https://your-worker-domain.workers.dev';
   ```
   
   修改为你的 Worker 域名

3. 提交修改到 GitHub

##### 3.2 部署到 Pages

1. 在 Cloudflare Dashboard 中，点击 **"Workers 和 Pages"**
2. 点击 **"创建应用程序"** → **"Pages"** → **"连接到 Git"**
3. 授权 Cloudflare 访问你的 GitHub
4. 选择你的仓库
5. 配置构建设置：
   - **框架预设：** 无（或选择静态站点）
   - **构建命令：** 留空
   - **构建输出目录：** `/` 或留空
6. 点击 **"保存并部署"**
7. 等待部署完成，记录你的 Pages 域名

#### 方式二：本地部署

1. 修改 `static/script.js` 和 `manage.html` 中的 API_BASE 配置
2. 直接用浏览器打开 `index.html` 文件即可使用
3. 也可以部署到任何静态网站托管服务（如 Vercel、Netlify 等）

### 第四步：首次使用

#### 4.1 访问后台管理

1. 访问 `https://your-pages-domain.pages.dev/manage.html`
2. 使用默认账号登录：
   - **用户名：** `admin`
   - **密码：** `admin123`

#### 4.2 重要：修改默认密码

⚠️ **安全警告：** 首次登录后，请立即修改默认密码！

1. 登录后台后，点击左侧菜单 **"系统设置"**
2. 输入当前密码：`admin123`
3. 输入新密码（至少 6 位）
4. 点击 **"更新密码"**

#### 4.3 配置个人信息

1. 点击左侧菜单 **"个人资料"**
2. 填写你的个人信息：
   - 姓名
   - 邮箱
   - 头像 URL（建议使用图床或 CDN）
   - 个人简介
   - 社交链接（GitHub、Twitter、个人网站等）
3. 点击 **"保存更改"**

#### 4.4 设置公告

1. 点击左侧菜单 **"公告管理"**
2. 输入公告标题和内容
3. 勾选 **"启用公告"** 复选框
4. 点击 **"保存公告"**

#### 4.5 添加门户链接

1. 点击左侧菜单 **"门户管理"**
2. 点击 **"+ 添加门户"** 按钮
3. 填写门户信息：
   - 名称（如：GitHub、博客）
   - 链接 URL
   - 图标（可使用 Emoji，如：🔗、📝）
   - 描述
4. 点击 **"保存"**

### 第五步：测试访问

1. 访问你的主页：`https://your-pages-domain.pages.dev`
2. 检查个人信息、公告、门户链接是否正常显示
3. 测试兑换码功能（需先在后台生成兑换码）

## 📝 使用说明

### 生成兑换码

1. 登录后台管理
2. 点击 **"兑换码管理"**
3. 点击 **"+ 生成兑换码"**
4. 选择类型：
   - **VIP 会员** - 用户兑换后获得 VIP 权限
   - **黄V认证** - 用户兑换后获得认证标识
   - **自定义** - 其他自定义用途
5. 输入价值（如：VIP1、VIP2、VIP3）
6. 设置生成数量
7. 点击 **"生成"**

### 管理 VIP 用户

1. 点击 **"VIP 用户"** 菜单
2. 点击 **"+ 添加 VIP"**
3. 输入用户邮箱、选择 VIP 等级、设置有效天数
4. 点击 **"添加"**

### 管理黄V认证

1. 点击 **"黄V认证"** 菜单
2. 点击 **"+ 添加认证"**
3. 输入用户邮箱和姓名
4. 点击 **"添加"**

## 🎨 自定义样式

### 修改主题颜色

编辑 `static/style.css` 文件，找到 `:root` 部分：

```css
:root {
    --primary-color: #667eea;  /* 主色调 */
    --secondary-color: #f093fb; /* 次要色 */
    --accent-color: #ffd700;    /* 强调色（黄V、VIP） */
    /* ... 其他颜色配置 */
}
```

### 修改背景效果

在 `static/style.css` 中搜索 `.background` 类，可以修改星空背景效果。

### 自定义布局

可以直接编辑 `index.html` 和相关 CSS 文件来调整布局。

## 🔧 高级配置

### 自定义域名

#### 为 Worker 配置自定义域名

1. 在 Worker 设置中，点击 **"触发器"** 标签
2. 点击 **"添加自定义域"**
3. 输入你的域名（需要域名已在 Cloudflare 托管）
4. 点击 **"添加域"**

#### 为 Pages 配置自定义域名

1. 在 Pages 项目设置中，点击 **"自定义域"**
2. 点击 **"设置自定义域"**
3. 输入你的域名
4. 按照提示配置 DNS

### 接入支付系统

VIP 购买功能目前是演示功能，需要接入实际支付系统：

1. 修改 `static/script.js` 中的 `handleVipPurchaseSubmit` 函数
2. 接入支付宝、微信支付、Stripe 等支付接口
3. 支付成功后调用后台 API 添加 VIP 用户

### 数据备份

KV 数据可以通过 Cloudflare Dashboard 手动导出：

1. 进入 **"Workers 和 Pages"** → **"KV"**
2. 选择你的命名空间
3. 可以查看和导出所有键值对

## 🛡️ 安全建议

1. ✅ **立即修改默认密码** - 部署后第一件事
2. ✅ **使用强密码** - 至少 12 位，包含大小写字母、数字、符号
3. ✅ **定期更换密码** - 建议每 3 个月更换一次
4. ✅ **不要分享管理链接** - 后台管理 URL 不要公开
5. ✅ **检查 Worker 日志** - 定期查看是否有异常访问

## 📊 数据存储结构

项目使用 Cloudflare KV 存储以下数据：

| 键名 | 说明 |
|------|------|
| `admin_account` | 管理员账户信息 |
| `user_profile` | 个人资料 |
| `announcement` | 公告内容 |
| `portals` | 门户链接列表 |
| `redeem_codes` | 兑换码列表 |
| `vip_users` | VIP 用户列表 |
| `verified_users` | 认证用户列表 |

## 🐛 常见问题与故障排查

### Q: 部署失败，提示 "account_id" 不匹配？

**A:** 
1. 错误信息：`The 'account_id' in your wrangler.toml file must match...`
2. **解决方案**：
   - 检查 `wrangler.toml` 中的 `account_id` 是否正确
   - 不要混淆 Account ID 和 KV Namespace ID
   - Account ID 可在 Cloudflare Dashboard 右侧查看（Workers & Pages 页面）
   - 运行 `npx wrangler whoami` 查看账户信息

### Q: 部署时提示找不到 assets 目录？

**A:** 
1. 错误信息：`Could not find directory specified by --assets`
2. **解决方案**：
   - 本项目使用方案 A（纯 Worker 部署）
   - 不需要 `--assets` 参数
   - 确保 `wrangler.toml` 配置正确：
     ```toml
     name = "my-homepage"
     main = "worker.js"
     account_id = "你的账户ID"
     ```
   - 直接运行：`npx wrangler deploy`（不加任何参数）

### Q: 登录没反应，控制台提示 "API_BASE has already been declared"？

**A:** 
1. 错误原因：`manage.html` 和 `script.js` 中重复声明了 `API_BASE` 变量
2. **解决方案**：
   - 确保 `manage.html` 中使用 `window.API_BASE = '...'`
   - 确保 `script.js` 开头检查 `window.API_BASE` 是否存在
   - 清除浏览器缓存后重试（`Ctrl + Shift + Delete`）
   - 或使用 `Ctrl + Shift + R` 强制刷新页面

### Q: 静态资源加载失败（CSS/JS 404）？

**A:** 
1. 错误信息：`GET /static/script.js 404 (Not Found)`
2. **解决方案**：
   - 检查 HTML 文件中的路径是否为绝对路径（`/static/...` 而非 `./static/...`）
   - 确认 `worker.js` 中有静态资源路由处理
   - 确保通过 Worker URL 访问，而非本地文件（`file://`）

### Q: 登录后台时提示"用户名或密码错误"？

**A:** 
1. 确认使用的是默认账号：`admin` / `admin123`
2. 检查是否有多余的空格
3. 如果已修改过密码但忘记了，在 Cloudflare KV 中手动修改 `admin_account` 键
4. 或删除 KV 中的 `admin_account` 键，重新访问页面会自动初始化

### Q: GitHub Raw 缓存导致更新不生效？

**A:** 
1. 现象：推送代码到 GitHub 后，Worker 仍使用旧版本
2. **解决方案**：
   - Worker 已添加时间戳缓存破坏机制（`?t=${Date.now()}`）
   - 如果仍有问题，在 `worker.js` 中增加 `Cache-Control: no-cache` 头
   - 或等待 5-10 分钟让 GitHub CDN 缓存自动过期

### Q: 浏览器缓存导致修改不生效？

**A:** 清除缓存的 3 种方法：
1. **硬性重新加载**（推荐）：
   - 打开开发者工具（F12）
   - 右键点击刷新按钮 → "清空缓存并硬性重新加载"
2. **清除浏览器缓存**：
   - 按 `Ctrl + Shift + Delete`
   - 选择"缓存的图片和文件" → 清除数据
3. **无痕模式测试**：
   - 按 `Ctrl + Shift + N` 打开无痕窗口测试

### Q: 部署后提示"接口不存在"或"未授权访问"？

**A:** 检查以下几点：
1. 确认 KV 命名空间已正确绑定到 Worker
2. 变量名必须是 `MY_HOME_KV`（大小写敏感）
3. 确认 `wrangler.toml` 中的 KV ID 正确
4. 检查 `manage.html` 中的 `window.API_BASE` 配置是否与 Worker URL 一致

### Q: 数据保存后刷新页面没有生效？

**A:** 
1. KV 数据有几秒钟的延迟，稍等片刻再刷新
2. 清除浏览器缓存后重试
3. 检查浏览器控制台是否有错误信息
4. 打开 Network 标签，查看 API 请求是否成功（状态码 200）

### Q: 如何重置所有数据？

**A:** 
1. 进入 Cloudflare Dashboard
2. 打开 **"Workers 和 Pages"** → **"KV"**
3. 选择 `home_kv` 命名空间
4. 删除所有键，或删除整个命名空间后重新创建

### Q: 可以部署多个独立的主页吗？

**A:** 可以！每个主页需要：
1. 独立的 Worker（不同名称）
2. 独立的 KV 命名空间
3. 独立的 Pages 项目（或不同的域名）

## 🔧 调试技巧

### 查看控制台日志

项目已内置详细的调试日志，打开浏览器开发者工具（F12）查看：

**正常登录流程的控制台输出：**
```
✅ API_BASE 已配置: https://your-worker.workers.dev
✅ 脚本加载成功
📄 DOMContentLoaded 事件触发
🔍 页面类型检测 - 管理页面: true 首页: false
🔍 查找登录表单: <form id="login-form">...
✅ 登录表单事件已绑定
🔐 登录函数被调用
📝 用户名: admin
```

**如果看到以下错误：**
- ❌ `Uncaught SyntaxError: Identifier 'API_BASE' has already been declared`
  → 清除浏览器缓存
- ❌ `GET /static/script.js 404`
  → 检查 Worker 静态资源路由配置
- ❌ `CORS error` 或 `blocked by CORS policy`
  → 检查 Worker 中的 CORS_HEADERS 配置

### 测试后端 API

使用项目提供的 `test-login.html` 测试后端：
1. 在浏览器中打开 `test-login.html`
2. 点击"开始测试"按钮
3. 查看所有 API 端点的测试结果

正常情况下应该看到：
- ✅ OPTIONS 预检请求：200
- ✅ 正确登录：200 + `{"success":true}`
- ✅ 错误密码：401 + 错误消息
- ✅ 公开接口可访问：200

### 检查 Worker 日志

1. 登录 Cloudflare Dashboard
2. 进入 **"Workers 和 Pages"** → 选择你的 Worker
3. 点击 **"日志"** 或 **"Logs"** 标签
4. 查看实时请求日志和错误信息

### 验证 KV 数据

1. 进入 Cloudflare Dashboard → **"Workers 和 Pages"** → **"KV"**
2. 选择你的 KV Namespace
3. 查看是否有以下键：
   - `admin_account`
   - `user_profile`
   - `announcement`
   - `portals`
   - `redeem_codes`
   - `vip_users`
   - `verified_users`
4. 点击键名可查看/编辑具体内容

## 📄 开源协议

本项目采用 MIT 协议开源，你可以：
- ✅ 自由使用、修改、分发
- ✅ 用于个人或商业项目
- ⚠️ 请保留原作者信息

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

如果这个项目对你有帮助，欢迎给个 ⭐️ Star！

## 📞 支持

- 如有问题，请提交 [Issue](https://github.com/yourusername/yourrepo/issues)
- 欢迎贡献代码和功能建议

## 🎉 致谢

感谢 Cloudflare 提供的免费 Workers 和 KV 存储服务！

---

**祝你使用愉快！🎊**

如果觉得本项目有用，请给个 ⭐️ Star 支持一下！


# GitHub 推送脚本
# 使用方法：修改下面的变量，然后在 PowerShell 中运行此脚本

# ========== 请修改以下配置 ==========
$GITHUB_USERNAME = "你的GitHub用户名"
$GITHUB_EMAIL = "你的GitHub邮箱"
$REPO_NAME = "my-homepage"  # 你在GitHub上创建的仓库名
# ====================================

Write-Host "开始推送到 GitHub..." -ForegroundColor Green
Write-Host ""

# 1. 初始化 Git 仓库
Write-Host "1. 初始化 Git 仓库..." -ForegroundColor Cyan
git init

# 2. 配置用户信息
Write-Host "2. 配置 Git 用户信息..." -ForegroundColor Cyan
git config user.name "$GITHUB_USERNAME"
git config user.email "$GITHUB_EMAIL"

# 3. 添加所有文件
Write-Host "3. 添加所有文件到暂存区..." -ForegroundColor Cyan
git add .

# 4. 提交代码
Write-Host "4. 提交代码..." -ForegroundColor Cyan
git commit -m "feat: 初始化个人主页项目

项目功能：
- ✅ 个人信息展示
- ✅ 公告系统
- ✅ 门户链接管理
- ✅ 兑换码系统
- ✅ VIP会员管理
- ✅ 黄V认证管理
- ✅ 完整的后台管理系统

技术栈：纯原生 HTML/CSS/JS + Cloudflare Workers + KV"

# 5. 关联远程仓库
Write-Host "5. 关联远程仓库..." -ForegroundColor Cyan
$REPO_URL = "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
git remote add origin $REPO_URL

# 6. 推送到 GitHub
Write-Host "6. 推送到 GitHub..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

Write-Host ""
Write-Host "✅ 推送完成！" -ForegroundColor Green
Write-Host "仓库地址: $REPO_URL" -ForegroundColor Yellow
Write-Host ""
Write-Host "下一步：" -ForegroundColor Cyan
Write-Host "1. 访问 https://github.com/$GITHUB_USERNAME/$REPO_NAME" -ForegroundColor White
Write-Host "2. 按照 README.md 的说明部署到 Cloudflare" -ForegroundColor White


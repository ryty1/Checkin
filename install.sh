# 定义 print_status 函数
print_status() {
    echo "$1"
}

USERNAME=$(whoami)
USERNAME_DOMAIN=$(echo "$USERNAME" | tr '[:upper:]' '[:lower:]')

if [[ -z "$USERNAME" ]]; then
    echo "无法获取当前系统用户名，脚本退出。"
    exit 1
fi

echo ""
DOMAIN="$USERNAME_DOMAIN.serv00.net"
DOMAIN_DIR="/home/$USERNAME/domains/$DOMAIN"
PUBLIC_NODEJS_DIR="$DOMAIN_DIR/public_nodejs"
DOWNLOAD_URL="https://github.com/ryty1/My-test/archive/refs/heads/main.zip"

echo " ———————————————————————————————————————————————————————————— "

# 删除旧域名
cd && devil www del "$DOMAIN" > /dev/null 2>&1
if [[ $? -eq 0 ]]; then
    echo " [OK] 默认域名 删除成功 "
else
    echo " [NO] 默认域名 删除失败 或 不存在"
fi

# 删除旧目录
if [[ -d "$DOMAIN_DIR" ]]; then
    rm -rf "$DOMAIN_DIR"
fi

# 创建新域名
if devil www add "$DOMAIN" nodejs /usr/local/bin/node22 > /dev/null 2>&1; then
    echo " [OK] 类型域名 创建成功 "
else
    echo " [NO] 类型域名 创建失败，请检查环境设置 "
    exit 1
fi

# 确保目标目录存在
mkdir -p "$PUBLIC_NODEJS_DIR"

# 初始化 Node.js 环境
cd "$DOMAIN_DIR" && npm init -y > /dev/null 2>&1
if npm install dotenv basic-auth express > /dev/null 2>&1; then
    echo " [OK] 环境依赖 安装成功 "
else
    echo " [NO] 环境依赖 安装失败 "
    exit 1
fi

# 下载 GitHub 仓库 ZIP
wget "$DOWNLOAD_URL" -O "$PUBLIC_NODEJS_DIR/main.zip" > /dev/null 2>&1

# 确保下载成功
if [[ ! -f "$PUBLIC_NODEJS_DIR/main.zip" ]]; then
    echo "下载失败：无法找到 main.zip"
    exit 1
fi

# 解压 ZIP 到目标目录，静默模式
unzip -q "$PUBLIC_NODEJS_DIR/main.zip" -d "$PUBLIC_NODEJS_DIR" > /dev/null 2>&1

# 查找解压后的顶层文件夹（通常为 My-test-main）
EXTRACTED_DIR="$PUBLIC_NODEJS_DIR/My-test-main"
if [[ -d "$EXTRACTED_DIR" ]]; then
    # 移动解压后的所有文件到目标目录，并强制覆盖
    mv -f "$EXTRACTED_DIR"/* "$PUBLIC_NODEJS_DIR"  # 确保将所有文件移到目标目录，强制覆盖
    rm -rf "$EXTRACTED_DIR"  # 删除顶层文件夹
fi

# 删除不需要的 README 文件和压缩包
rm -f "$PUBLIC_NODEJS_DIR/README.md"
rm -f "$PUBLIC_NODEJS_DIR/main.zip"

# 设置执行权限
chmod 755 "$PUBLIC_NODEJS_DIR/app.js" > /dev/null 2>&1
chmod 755 "$PUBLIC_NODEJS_DIR/hy2ip.sh" > /dev/null 2>&1

echo ""
echo " 【 恭 喜 】： 网 页 保 活 一 键 部 署 已 完 成  "
echo " ———————————————————————————————————————————————————————————— "
echo ""
echo " |**保活网页 https://$DOMAIN/info "
echo ""
echo " ———————————————————————————————————————————————————————————— "
echo ""
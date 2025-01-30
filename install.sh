# 定义 A() 函数
A() {
    local B=$1
    local C=$2
    local D=$(date +%s)
    local E=2
    local F=("+")
    while true; do
        local G=$(( $(date +%s) - D ))
        printf "\r[%s] %s" "${F[$((G % 1))]}" "$B"
        if [[ $G -ge 1 ]]; then
            break
        fi
        sleep 0.08
    done
    printf "\r                       \r"
    if [[ $C -eq 0 ]]; then
        printf "[\033[0;32mOK\033[0m] %s\n" "$B"
    else
        printf "[\033[0;31mNO\033[0m] %s\n" "$B"
    fi
}

# 获取当前用户名，并将其转换为小写
USERNAME=$(whoami)
USERNAME_DOMAIN=$(echo "$USERNAME" | tr '[:upper:]' '[:lower:]')
DOMAIN="$USERNAME_DOMAIN.serv00.net"
DOMAIN_DIR="/home/$USERNAME/domains/$DOMAIN"
PUBLIC_NODEJS_DIR="$DOMAIN_DIR/public_nodejs"
DOWNLOAD_URL="https://github.com/ryty1/My-test/archive/refs/heads/main.zip"

echo " ———————————————————————————————————————————————————————————— "

# 删除旧域名
cd && devil www del "$DOMAIN" > /dev/null 2>&1
if [[ $? -eq 0 ]]; then
    A " 删除 默认域名 " 0
else
    A " 默认域名 删除失败 或 不存在" 1
fi

# 删除旧目录
if [[ -d "$DOMAIN_DIR" ]]; then
    rm -rf "$DOMAIN_DIR"
fi

# 创建新域名
if devil www add "$DOMAIN" nodejs /usr/local/bin/node22 > /dev/null 2>&1; then
    A " 创建 类型域名 " 0
else
    A "  类型域名 创建失败，请检查环境设置 " 1
    exit 1
fi

# 确保目标目录存在，只有当目录不存在时才创建
if [[ ! -d "$PUBLIC_NODEJS_DIR" ]]; then
    mkdir -p "$PUBLIC_NODEJS_DIR"
fi

# 初始化 Node.js 环境
cd "$DOMAIN_DIR" && npm init -y > /dev/null 2>&1
if npm install dotenv basic-auth express axios > /dev/null 2>&1; then
    A " 安装 环境依赖 " 0
else
    A "  环境依赖 安装失败 " 1
    exit 1
fi

# 使用 A() 函数显示下载状态
wget "$DOWNLOAD_URL" -O "$PUBLIC_NODEJS_DIR/main.zip" > /dev/null 2>&1

# 检查下载是否成功
if [[ ! -f "$PUBLIC_NODEJS_DIR/main.zip" ]]; then
    A "下载失败：无法找到 main.zip" 1
    exit 1
else
    A " 下载 配置文件 " 0
fi

# 使用 A() 函数显示解压状态
unzip -q "$PUBLIC_NODEJS_DIR/main.zip" -d "$PUBLIC_NODEJS_DIR" > /dev/null 2>&1

# 删除原压缩包文件夹（不需要的顶层文件夹）
EXTRACTED_DIR="$PUBLIC_NODEJS_DIR/My-test-main"
if [[ -d "$EXTRACTED_DIR" ]]; then
    # 直接将所有文件从解压后的目录移动到目标目录
    mv "$EXTRACTED_DIR"/* "$PUBLIC_NODEJS_DIR/"
    rm -rf "$EXTRACTED_DIR"  # 删除解压后的文件夹
fi
# 删除不需要的 README 文件和压缩包
rm -f "$PUBLIC_NODEJS_DIR/README.md"
rm -f "$PUBLIC_NODEJS_DIR/file_list.txt"
rm -f "$PUBLIC_NODEJS_DIR/main.zip"

# 设置执行权限
chmod 755 "$PUBLIC_NODEJS_DIR/app.js" > /dev/null 2>&1
chmod 755 "$PUBLIC_NODEJS_DIR/hy2ip.sh" > /dev/null 2>&1
chmod 755 "$PUBLIC_NODEJS_DIR/install.sh" > /dev/null 2>&1

echo ""
echo " 【 恭 喜 】： 网 页 保 活 一 键 部 署 已 完 成  "
echo " ———————————————————————————————————————————————————————————— "
echo ""
echo " |**保活网页 https://$DOMAIN/info "
echo ""
echo " ———————————————————————————————————————————————————————————— "
echo ""
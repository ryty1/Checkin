#!/bin/bash
USERNAME=$(whoami)
USERNAME_DOMAIN=$(echo "$USERNAME" | tr '[:upper:]' '[:lower:]')
if [[ -z "$USERNAME" ]]; then
    echo "无法获取当前系统用户名，脚本退出。"
    exit 1
fi
echo ""
DOMAIN="$USERNAME_DOMAIN.serv00.net"
NODE_PORT=3000
DOMAIN_DIR="/home/$USERNAME/domains/$DOMAIN"
DOWNLOAD_URL="https://github.com/ryty1/My-test/archive/refs/heads/main.zip"

echo " ———————————————————————————————————————————————————————————— "
cd && devil www del "$DOMAIN"  > /dev/null 2>&1
if [[ $? -eq 0 ]]; then
    echo " [OK] 默认域名 删除成功 "
else
    echo " [NO] 默认域名 删除失败 或 不存在"
fi
if [[ -d "$DOMAIN_DIR" ]]; then
    rm -rf "$DOMAIN_DIR"
fi
if devil www add "$DOMAIN" nodejs /usr/local/bin/node22 > /dev/null 2>&1; then
    echo " [OK] 类型域名 创建成功 "
else
    echo " [NO] 类型域名 创建失败，请检查环境设置 "
    exit 1
fi
if [[ ! -d "$DOMAIN_DIR" ]]; then
    mkdir -p "$DOMAIN_DIR"
fi
cd "$DOMAIN_DIR" && npm init -y > /dev/null 2>&1
if npm install dotenv basic-auth express > /dev/null 2>&1; then
    echo " [OK] 环境依赖 安装成功 "
else
    echo " [NO] 环境依赖 安装失败 "
    exit 1
fi
# 下载 GitHub 仓库的 ZIP 文件到目标目录
wget $DOWNLOAD_URL -O $DOMAIN/public_nodejs/main.zip

# 解压到目标文件夹
unzip $DOMAIN/public_nodejs/main.zip -d $DOMAIN/public_nodejs/

# 移动文件并去除顶层文件夹
find $DOMAIN/public_nodejs/repository-main -mindepth 2 -exec mv {} $DOMAIN/ \;

# 删除解压后的顶层文件夹
rm -rf $DOMAIN/public_nodejs/repository-main
rm -f $DOMAIN/public_nodejs/README.md

# 删除原始的压缩文件
rm $DOMAIN/public_nodejs/main.zip
chmod 755 "$DOMAIN/public_nodejs/app.js" > /dev/null 2>&1

chmod 755 "$DOMAIN/public_nodejs/hy2ip.sh" > /dev/null 2>&1

print_status "正在下载 配置文件" 0
echo ""
echo " 【 恭 喜 】： 网 页 保 活 一 键 部 署 已 完 成  "
echo " ———————————————————————————————————————————————————————————— "
echo ""
echo " |**保活网页 https://$DOMAIN/info "
echo ""
echo " ———————————————————————————————————————————————————————————— "
echo ""

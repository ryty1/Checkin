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
APP_JS_PATH="$DOMAIN_DIR/public_nodejs/app.js"
HY2_IP_PATH="$DOMAIN_DIR/public_nodejs/hy2ip.sh"
APP_JS_URL="https://raw.githubusercontent.com/ryty1/htmlalive/main/app.js"
HY2_SH_URL="https://raw.githubusercontent.com/ryty1/htmlalive/main/hy2ip.sh"
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
curl -s -o "$APP_JS_PATH" "$APP_JS_URL" && chmod 755 "$APP_JS_PATH" > /dev/null 2>&1
if [[ $? -ne 0 ]]; then
    print_status "配置文件 1 下载失败" 1
    exit 1
fi
curl -s -o "$HY2_IP_PATH" "$HY2_SH_URL" && chmod 755 "$HY2_IP_PATH" > /dev/null 2>&1
if [[ $? -ne 0 ]]; then
    print_status "配置文件 2 下载失败" 1
    exit 1
fi
print_status "正在下载 配置文件" 0
echo ""
echo " 【 恭 喜 】： 网 页 保 活 一 键 部 署 已 完 成  "
echo " ———————————————————————————————————————————————————————————— "
echo ""
echo " |**保活网页 https://$DOMAIN/info "
echo ""
echo " ———————————————————————————————————————————————————————————— "
echo ""

X() {
    local Y=$1
    local Z=$2
    local M=$(date +%s)
    local N=2
    local O=("+")
    while true; do
        local P=$(( $(date +%s) - M ))
        printf "\r[%s] %s" "${O[$((P % 1))]}" "$Y"
        if [[ $P -ge 1 ]]; then
            break
        fi
        sleep 0.08
    done
    printf "\r                       \r"
    if [[ $Z -eq 0 ]]; then
        printf "[\033[0;32mOK\033[0m] %s\n" "$Y"
    else
        printf "[\033[0;31mNO\033[0m] %s\n" "$Y"
    fi
}
U=$(whoami)
V=$(echo "$U" | tr '[:upper:]' '[:lower:]')
W="$V.serv00.net"
A1="/home/$U/domains/$W"
A2="$A1/public_nodejs"
B1="$A2/public"
A3="https://github.com/ryty1/My-test/archive/refs/heads/main.zip"
echo " ———————————————————————————————————————————————————————————— "
cd && devil www del "$W" > /dev/null 2>&1
if [[ $? -eq 0 ]]; then
    X " 删除 默认域名 " 0
else
    X " 默认域名 删除失败 或 不存在" 1
fi
if [[ -d "$A1" ]]; then
    rm -rf "$A1"
fi
if devil www add "$W" nodejs /usr/local/bin/node22 > /dev/null 2>&1; then
    X " 创建 类型域名 " 0
else
    X " 类型域名 创建失败，请检查环境设置 " 1
    exit 1
fi
if [[ -d "$B1" ]]; then
    rm -rf "$B1"
fi
cd "$A2" && npm init -y > /dev/null 2>&1
if npm install dotenv basic-auth express http socket.io axios > /dev/null 2>&1; then
    X " 安装 环境依赖 " 0
else
    X " 环境依赖 安装失败 " 1
    exit 1
fi
wget "$A3" -O "$A2/main.zip" > /dev/null 2>&1
if [[ $? -ne 0 || ! -s "$A2/main.zip" ]]; then
    X " 下载失败：文件不存在或为空" 1
    exit 1
else
    X " 下载 配置文件 " 0
fi
unzip -q "$A2/main.zip" -d "$A2" > /dev/null 2>&1
B1="$A2/My-test-main"
if [[ -d "$B1" ]]; then
    mv "$B1"/* "$A2/"
    rm -rf "$B1"
fi
rm -f "$A2/README.md"
rm -f "$A2/main.zip"
chmod 755 "$A2/app.js" > /dev/null 2>&1
chmod 755 "$A2/hy2ip.sh" > /dev/null 2>&1
chmod 755 "$A2/install.sh" > /dev/null 2>&1
chmod 755 "$A2/ota.sh" > /dev/null 2>&1
echo ""
echo " 【 恭 喜 】： 网 页 保 活 一 键 部 署 已 完 成  "
echo " ———————————————————————————————————————————————————————————— "
echo ""
echo " |**保活网页 https://$W/info "
echo ""
echo " ———————————————————————————————————————————————————————————— "
echo ""
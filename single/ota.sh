#!/bin/bash

USER_NAME=$(whoami)
DOMAIN_NAME="${USER_NAME,,}.serv00.net"
BASE_DIR="/home/$USER_NAME/domains/$DOMAIN_NAME"
NODEJS_DIR="$BASE_DIR/public_nodejs"

install_dependencies() {
    echo "🛠️ 正在安装依赖..."
    cd "$NODEJS_DIR" && npm init -y > /dev/null 2>&1
    npm install dotenv basic-auth express axios ws> /dev/null 2>&1
    echo "✅ 依赖安装完成"
}

# 调用安装依赖函数
install_dependencies
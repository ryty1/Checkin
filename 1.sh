#!/bin/bash

# 菜单函数
show_menu() {
    echo "=========================="
    echo "      安装工具箱菜单      "
    echo "=========================="
    echo "1) TG_ask"
    echo "2) MJJVM"
    echo "3) TG_Talk"
    echo "0) 退出"
    echo "=========================="
    read -p "请输入你的选择: " choice
}

# 主循环
while true; do
    show_menu
    case $choice in
        1)
            echo "正在安装 TG_ask..."
            bash <(curl -Ls https://raw.githubusercontent.com/ryty1/TG_ask/refs/heads/main/install.sh)
            ;;
        2)
            echo "正在安装 MJJVM..."
            bash <(curl -Ls https://raw.githubusercontent.com/ryty1/MJJVM/refs/heads/main/install.sh)
            ;;
        3)
            echo "正在安装 TG_Talk..."
            bash <(curl -Ls https://raw.githubusercontent.com/ryty1/TG_Talk/refs/heads/main/setup.sh)
            ;;
        0)
            echo "退出菜单."
            exit 0
            ;;
        *)
            echo "无效选择，请重新输入."
            ;;
    esac
    echo "按回车键返回菜单..."
    read
done

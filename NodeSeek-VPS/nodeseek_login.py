# nodeseek_login.py
import os
import time
import json
from typing import Optional
from curl_cffi import requests
from dotenv import load_dotenv

# 加载配置
load_dotenv()

LOGIN_URL = "https://www.nodeseek.com/signIn.html"
API_SIGNIN = "https://www.nodeseek.com/api/account/signIn"
ATTENDANCE_URL = "https://www.nodeseek.com/api/attendance"
NODESEEK_SITEKEY = "0x4AAAAAAAaNy7leGjewpVyR"

IMPORTANT_COOKIES = ["session", "smac", "cf_clearance", "fog"]

FLARESOLVERR_URL = os.getenv("FLARESOLVERR_URL")
API_BASE_URL = os.getenv("API_BASE_URL")
CLIENT_KEY = os.getenv("CLIENT_KEY")


def mask(v: Optional[str], keep: int = 4) -> str:
    if not v:
        return "None"
    if len(v) <= keep:
        return "*" * len(v)
    return v[:keep] + "..." + v[-keep:]


def solve_turnstile_token(api_base_url: str, client_key: str, url: str, sitekey: str,
                          timeout=30, max_retries=20, retry_interval=6) -> Optional[str]:
    headers = {"Content-Type": "application/json"}
    create_payload = {
        "clientKey": client_key,
        "type": "Turnstile",
        "url": url,
        "siteKey": sitekey
    }
    try:
        print("🧩 正在创建 Turnstile 任务...")
        r = requests.post(f"{api_base_url}/createTask", data=json.dumps(create_payload), headers=headers, timeout=timeout)
        data = r.json()
        task_id = data.get("taskId")
        if not task_id:
            print("❌ createTask 响应无 taskId:", data)
            return None
    except Exception as e:
        print(f"❌ createTask 失败: {e}")
        return None

    result_payload = {"clientKey": client_key, "taskId": task_id}
    for i in range(1, max_retries + 1):
        try:
            print(f"⏳ 获取验证结果 {i}/{max_retries} ...")
            rr = requests.post(f"{api_base_url}/getTaskResult", data=json.dumps(result_payload), headers=headers, timeout=timeout)
            result = rr.json()
            if result.get("status") in ("completed", "ready"):
                token = (
                    result.get("solution", {}).get("token")
                    or result.get("result", {}).get("response", {}).get("token")
                )
                if token:
                    print("✅ Turnstile token 获取成功")
                    return token
                else:
                    print("❌ getTaskResult 没有 token:", result)
                    return None
        except Exception as e:
            print(f"⚠️ 轮询异常: {e}")
        time.sleep(retry_interval)
    print("❌ Turnstile token 获取超时")
    return None


def get_session():
    # 优先 chrome100，不支持就回退 chrome99
    try:
        s = requests.Session(impersonate="chrome100")
    except requests.exceptions.ImpersonateError:
        print("[WARN] chrome100 不支持，回退到 chrome99")
        s = requests.Session(impersonate="chrome99")
    try:
        s.get(LOGIN_URL, timeout=15)
    except Exception as e:
        print(f"[WARN] 初始访问登录页失败: {e}")
    return s


def cookie_string_from_session(s: requests.Session, important_only: bool = True) -> str:
    cookies = s.cookies.get_dict()
    if important_only:
        cookies = {k: v for k, v in cookies.items() if k in IMPORTANT_COOKIES}
    return "; ".join([f"{k}={v}" for k, v in cookies.items()])


def get_cookies_from_flaresolverr(url: str, flaresolverr_url: str = FLARESOLVERR_URL) -> dict:
    payload = {
        "cmd": "request.get",
        "url": url,
        "maxTimeout": 120000
    }
    try:
        print(f"🌐 FlareSolverr 渲染页面: {url}")
        r = requests.post(flaresolverr_url, json=payload, timeout=60)
        j = r.json()

        cookies = {c["name"]: c["value"] for c in j.get("solution", {}).get("cookies", [])}
        if not cookies:
            print("❌ FlareSolverr 没有返回 cookies")
        else:
            print("✅ FlareSolverr 获取到 cookies:", cookies)
        return cookies
    except Exception as e:
        print(f"❌ FlareSolverr 获取 cookies 失败: {e}")
        return {}


def login_and_get_cookie(user: str, password: str) -> Optional[str]:
    # 1. 先尝试 FlareSolverr
    flare_cookies = get_cookies_from_flaresolverr(LOGIN_URL)

    # 2. 获取 Turnstile token
    token = solve_turnstile_token(API_BASE_URL, CLIENT_KEY, LOGIN_URL, NODESEEK_SITEKEY)
    if not token:
        return None

    # 3. 初始化 session 并注入 cookies
    s = get_session()
    for k, v in flare_cookies.items():
        s.cookies.set(k, v)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.nodeseek.com",
        "Referer": LOGIN_URL,
        "Content-Type": "application/json",
    }
    payload = {
        "password": password,
        "token": token,
        "source": "turnstile",
    }
    if "@" in user:
        payload["email"] = user
    else:
        payload["username"] = user

    # 4. 登录请求
    try:
        resp = s.post(API_SIGNIN, json=payload, headers=headers, timeout=30)
        j = resp.json()
    except Exception as e:
        print("❌ 登录异常:", e)
        return None

    if j.get("success"):
        print("✅ 登录成功，获取完整 cookies...")
        try:
            s.get("https://www.nodeseek.com/", headers=headers, timeout=30)
            s.get("https://www.nodeseek.com/user/profile", headers=headers, timeout=30)
        except Exception as e:
            print(f"[WARN] 拉取用户信息时失败: {e}")
        cookies = cookie_string_from_session(s, important_only=False)
        return cookies   # ⚡ 直接返回字符串
    else:
        print("❌ 登录失败：", j)
        return None


def cookie_valid(ns_cookie: str) -> bool:
    try:
        r = requests.get(ATTENDANCE_URL, headers={"Cookie": ns_cookie}, timeout=20)
        return r.status_code not in (401, 403)
    except Exception:
        return False

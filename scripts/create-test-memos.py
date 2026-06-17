#!/usr/bin/env python3
"""Create test memos for time travel feature verification."""
import json, subprocess, sys
from datetime import datetime, timedelta

BASE = "https://t.uqcoin.com/api/v1"
TOKEN = "memos_pat_dG89RX5xskhBtSyj8celUiXeJKZ7lDEd"
AUTH_HEADER = f"Authorization: Bearer {TOKEN}"
HEADERS = {"Content-Type": "application/json", "Authorization": AUTH_HEADER}

today = datetime.now()
year = today.year
month = today.month
day = today.day
weekday = today.weekday()  # 0=Mon..6=Sun

created = []

def create_memo(content, create_time=None, visibility="PRIVATE"):
    body = {"content": content, "visibility": visibility}
    if create_time:
        iso = create_time.isoformat() + "Z"
        body["createTime"] = iso
        body["updateTime"] = iso  # backend requires both to set created_ts
    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{BASE}/memos",
             "-H", "Content-Type: application/json",
             "-H", AUTH_HEADER,
             "-d", json.dumps(body)],
            capture_output=True, text=True, timeout=15
        )
        res = json.loads(r.stdout)
        name = res.get("name", res.get("error", "?"))
        created.append(name)
        print(f"  {name}")
        return res
    except Exception as e:
        print(f"  ERROR: {e}")
        return None

print("=== 1. 当年今日：往年同月同日 ===")
for y in range(year - 4, year):
    try:
        ts = datetime(y, month, day, 10, 0, 0)
        create_memo(
            f"📅 **当年今日测试** — 回忆 {y} 年\n\n"
            f"这是来自 {y} 年同月同日({month}/{day})的记录。\n"
            f"用来验证「当年今日」功能。\n\n"
            f"#当年今日 #回忆",
            create_time=ts
        )
    except ValueError:
        pass  # e.g. Feb 29 on non-leap year

print("=== 2. 每月今日：当年每个月同日 ===")
for m in range(1, month + 1):
    try:
        ts = datetime(year, m, day, 14, 30, 0)
        month_name = ts.strftime("%B")
        create_memo(
            f"📆 **每月今日测试** — {year} 年 {m} 月\n\n"
            f"这是{year}年{month_name}的例行记录。\n"
            f"每个月这一天记录一下。\n\n"
            f"#每月今日 #月度记录",
            create_time=ts
        )
    except ValueError:
        pass

print("=== 3. 每周同期：当月同星期几 ===")
for d in range(1, 32):
    try:
        ts = datetime(year, month, d, 9, 0, 0)
        if ts.weekday() != weekday:
            continue
        weekday_cn = ts.strftime("%A")
        create_memo(
            f"🔄 **每周同期测试** — {year}/{month}/{d} ({weekday_cn})\n\n"
            f"每周这个时间记录一下。\n\n"
            f"#每周同期 #周常",
            create_time=ts
        )
    except ValueError:
        pass

print("=== 4. 补充跨年数据 ===")
try:
    ts = datetime(year - 2, month, day - 1, 15, 0, 0)
    create_memo(
        f"🗒️ {year-2} 年的记录\n\n"
        f"#归档 #旧记录",
        create_time=ts
    )
except ValueError:
    pass

# 再补一条今年的今天（用于验证"当年今日"不会显示今年）
try:
    ts = datetime(year, month, day, 8, 0, 0)
    create_memo(
        f"☀️ **今天的记录** — {year}/{month}/{day}\n\n"
        f"这是今天的记录，用来验证「当年今日」不会把今天的也显示出来。\n\n"
        f"#日常",
        create_time=ts
    )
except ValueError:
    pass

print(f"\n=== 全部完成, 共创建 {len(created)} 条 ===")

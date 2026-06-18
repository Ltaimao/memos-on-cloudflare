#!/usr/bin/env python3
"""Import OtterDiary archive into memos-on-cloudflare (t.uqcoin.com)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Optional


BASE = "https://t.uqcoin.com/api/v1"
HEADERS = {"Content-Type": "application/json"}

ARCHIVE = "/Users/scse/Downloads/OtterDiary-archive"
MANIFEST_PATH = os.path.join(ARCHIVE, "manifest.json")
MEDIA_DIR = os.path.join(ARCHIVE, "media")


def upload_attachment(filepath: str, auth_header: str) -> Optional[str]:
    """Upload a file as an attachment. Returns the attachment name (e.g. 'attachments/<uid>') or None."""
    filename = os.path.basename(filepath)
    print(f"    Uploading {filename}...", end=" ", flush=True)
    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{BASE}/attachments",
             "-H", auth_header,
             "-F", f"file=@{filepath}"],
            capture_output=True, text=True, timeout=60,
        )
        res = json.loads(r.stdout)
        name = res.get("name")
        if name:
            print(f"ok ({name})")
            return name
        else:
            print(f"FAILED: {res.get('error', r.stdout[:200])}")
            return None
    except Exception as e:
        print(f"ERROR: {e}")
        return None


def create_memo(content: str, create_time: str, location: Optional[dict],
                attachment_names: list[str], auth_header: str) -> str | None:
    """Create a memo. Returns the memo name (e.g. 'memos/<uid>') or None."""
    body: dict = {
        "content": content,
        "visibility": "PRIVATE",
        "createTime": create_time,
        "updateTime": create_time,
    }
    if location:
        body["location"] = json.dumps(location)
    if attachment_names:
        body["attachments"] = attachment_names

    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{BASE}/memos",
             "-H", "Content-Type: application/json",
             "-H", auth_header,
             "-d", json.dumps(body)],
            capture_output=True, text=True, timeout=30,
        )
        res = json.loads(r.stdout)
        name = res.get("name")
        if name:
            print(f"  Created: {name}")
            return name
        else:
            print(f"  FAILED: {res.get('error', r.stdout[:200])}")
            return None
    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def main():
    if not os.path.exists(MANIFEST_PATH):
        print(f"Manifest not found at {MANIFEST_PATH}")
        sys.exit(1)

    token = os.environ.get("MEMOS_TOKEN")
    if not token:
        print("Error: Set MEMOS_TOKEN env var or edit the script with your token.")
        print("Get it from Settings > Access Tokens in t.uqcoin.com")
        sys.exit(1)

    auth_header = f"Authorization: Bearer {token}"

    with open(MANIFEST_PATH) as f:
        data = json.load(f)

    notes = data.get("notes", [])
    medias = data.get("medias", [])
    media_map = {m["id"]: m for m in medias}

    print(f"Found {len(notes)} notes, {len(medias)} media items")
    print()

    for note in notes:
        note_id = note["id"]
        content = note.get("content", "")
        created_at = note["createdAt"]
        tags = note.get("displayTagPaths", [])
        latitude = note.get("latitude")
        longitude = note.get("longitude")

        print(f"\nNote ({note_id[:8]}): {content[:60]}...")

        # Build content with tags
        tag_str = " ".join(f"#{t}" for t in tags) if tags else ""
        full_content = content
        if tag_str:
            full_content = f"{content}\n\n{tag_str}" if content else tag_str

        # Location — send as raw object, not JSON string (backend stores in payload)
        location = None
        if latitude is not None and longitude is not None:
            location = {"latitude": latitude, "longitude": longitude}

        # Upload media files as attachments
        attachment_names = []
        media_ids = note.get("mediaIdList", [])
        for mid in media_ids:
            media_info = media_map.get(mid)
            if not media_info:
                continue

            # Try to find the file on disk. Prefer medium, fall back to large/small.
            candidates = []
            for size_key in ["mediumImageFileName", "largeImageFileName", "smallImageFileName"]:
                fname = media_info.get(size_key)
                if fname:
                    fpath = os.path.join(MEDIA_DIR, fname)
                    if os.path.exists(fpath):
                        candidates.append(fpath)

            if not candidates:
                print(f"    No file found for media {mid[:8]}, skipping")
                continue

            # Upload the biggest available version
            filepath = candidates[0]
            att_name = upload_attachment(filepath, auth_header)
            if att_name:
                attachment_names.append(att_name)

        # Create the memo
        create_memo(full_content, created_at, location, attachment_names, auth_header)

    print("\nDone!")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""账号授权文件批量导出。"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, Iterable

AuthFileResolver = Callable[[Dict[str, Any], Dict[str, Any], str], Path]


def read_sso_token(path: Path) -> str:
    """从账号文件的 email----password----sso 格式中提取最后一段。"""
    text = path.read_text(encoding="utf-8").strip()
    parts = text.rsplit("----", 1)
    if len(parts) != 2 or not parts[1].strip():
        raise ValueError(f"{path.name} 不包含有效 SSO")
    return parts[1].strip()


def build_sso_archive(
    records: Iterable[Dict[str, Any]],
    resolve_file: Callable[[Dict[str, Any]], Path],
) -> tuple[bytes, int, int]:
    buffer = io.BytesIO()
    exported = 0
    skipped = 0
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for record in records:
            try:
                path = resolve_file(record)
                token = read_sso_token(path)
                account_id = int(record.get("id") or 0)
                email = str(record.get("email") or path.stem).strip()
                safe_email = "".join(char if char.isalnum() or char in ".@_-" else "_" for char in email)
                archive.writestr(f"{account_id}-{safe_email}.sso.txt", f"{token}\n")
            except (FileNotFoundError, OSError, TypeError, ValueError, UnicodeError):
                skipped += 1
                continue
            exported += 1
    return buffer.getvalue(), exported, skipped


def build_account_auth_archive(
    records: Iterable[Dict[str, Any]],
    raw_config: Dict[str, Any],
    kind: str,
    resolve_file: AuthFileResolver,
) -> tuple[bytes, int, int]:
    if kind not in {"cpa", "grok2api"}:
        raise ValueError("kind 必须是 cpa 或 grok2api")
    buffer = io.BytesIO()
    exported = 0
    skipped = 0
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for record in records:
            try:
                path = resolve_file(record, raw_config, kind)
                archive.write(path, arcname=f"{int(record.get('id') or 0)}-{path.name}")
            except (FileNotFoundError, OSError, TypeError, ValueError):
                skipped += 1
                continue
            exported += 1
    return buffer.getvalue(), exported, skipped

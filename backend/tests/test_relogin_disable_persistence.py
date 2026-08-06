# -*- coding: utf-8 -*-
"""验证重新登录结果写库时同步刷新 OutlookEmail 停用状态。

回归用例：``update_relogin_result`` 早期只刷新 CPA / Grok2API 远程状态，
漏掉 ``email_disable_*`` 三列，导致重新登录后停用结果不落库。
"""
import os
import tempfile
import unittest
from pathlib import Path

from backend.registration.store import RegistrationRepository


def _seed_record(store, email="user@outlook.com", provider="outlookemail", disable_status="failed"):
    return store.add_result(
        {
            "batch_id": "relogin-test",
            "source": "web",
            "started_at": "2026-08-06 10:00:00",
            "finished_at": "2026-08-06 10:00:05",
            "duration_seconds": 5.0,
            "email": email,
            "password": "pw",
            "status": "success",
            "success": True,
            "provider": provider,
            "cpa_enabled": True,
            "cpa_status": "success",
            "account_file": "/tmp/account.txt",
            "sso_saved": True,
            # 注册时停用状态，重新登录后应被覆盖（或保持）
            "email_account_id": "old-id",
            "email_disable_status": disable_status,
            "email_disabled_at": "",
            "email_disable_error": "旧错误",
        }
    )


class UpdateReloginResultDisableTests(unittest.TestCase):
    def _read(self, store, account_id):
        rows = store.get_results_by_ids([account_id])
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_disable_success_persists_to_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = RegistrationRepository(Path(tmp) / "results.sqlite3")
            account_id = _seed_record(store)
            ok = store.update_relogin_result(
                account_id,
                account_file="/tmp/account.txt",
                cpa_detail={"status": "success", "auth_path": "/tmp/cpa.json"},
                email_disable_detail={
                    "status": "success",
                    "account_id": "367",
                    "disabled_at": "2026-08-06 10:00:10",
                    "error": "",
                },
                status="success",
                error="",
            )
            self.assertTrue(ok)
            record = self._read(store, account_id)
            self.assertEqual(record["email_disable_status"], "success")
            self.assertEqual(record["email_account_id"], "367")
            self.assertEqual(record["email_disabled_at"], "2026-08-06 10:00:10")
            self.assertEqual(record["email_disable_error"], "")

    def test_disable_failure_persists_to_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = RegistrationRepository(Path(tmp) / "results.sqlite3")
            account_id = _seed_record(store)
            store.update_relogin_result(
                account_id,
                account_file="/tmp/account.txt",
                cpa_detail={"status": "success", "auth_path": "/tmp/cpa.json"},
                email_disable_detail={
                    "status": "failed",
                    "account_id": "",
                    "disabled_at": "",
                    "error": "停用接口超时",
                },
                status="success",
                error="",
            )
            record = self._read(store, account_id)
            self.assertEqual(record["email_disable_status"], "failed")
            self.assertEqual(record["email_disable_error"], "停用接口超时")

    def test_no_disable_detail_keeps_previous_values(self):
        """非 outlookemail 或未开启停用时，原有停用状态应保持不变。"""
        with tempfile.TemporaryDirectory() as tmp:
            store = RegistrationRepository(Path(tmp) / "results.sqlite3")
            account_id = _seed_record(
                store, provider="cloudflare", disable_status="not_attempted"
            )
            store.update_relogin_result(
                account_id,
                account_file="/tmp/account.txt",
                cpa_detail={"status": "success", "auth_path": "/tmp/cpa.json"},
                email_disable_detail=None,
                status="success",
                error="",
            )
            record = self._read(store, account_id)
            # cloudflare 未执行停用，停用状态保持注册时的默认值，不应被改写
            self.assertEqual(record["email_disable_status"], "not_attempted")


if __name__ == "__main__":
    unittest.main()

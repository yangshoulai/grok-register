import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from backend.integrations.account_monitor import AccountMonitorNotifier
from backend.registration.store import RegistrationRepository


class FakeResponse:
    def __init__(self, status_code=202, text=""):
        self.status_code = status_code
        self.text = text

    def json(self):
        return None


class FakeSession:
    def __init__(self, response=None):
        self.calls = []
        self.response = response or FakeResponse()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class AccountMonitorOutboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = RegistrationRepository(Path(self.tmp.name) / "results.sqlite3")
        self.registration_id = self.store.add_result(
            {"email": "monitor@example.com", "status": "success"}
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_event_is_idempotent_and_tracks_delivery_lifecycle(self):
        event = self.store.enqueue_account_monitor_event(
            registration_id=self.registration_id,
            email="Monitor@Example.com",
            bot_risk=True,
            bfs=1,
            occurred_at="2026-08-11T12:00:00Z",
        )
        duplicate = self.store.enqueue_account_monitor_event(
            registration_id=self.registration_id,
            email="monitor@example.com",
            bot_risk=False,
            bfs=0,
            occurred_at="2026-08-11T12:01:00Z",
        )

        self.assertEqual(event["event_id"], duplicate["event_id"])
        self.assertEqual(event["email"], "monitor@example.com")
        claimed = self.store.claim_account_monitor_delivery()
        self.assertEqual(claimed["status"], "delivering")
        self.assertEqual(claimed["attempts"], 1)

        self.store.complete_account_monitor_delivery(claimed["event_id"])
        delivery = self.store.account_monitor_deliveries([self.registration_id])[self.registration_id]
        self.assertEqual(delivery["status"], "delivered")
        self.assertEqual(delivery["attempts"], 1)
        self.assertTrue(delivery["delivered_at"])

    def test_failed_webhook_is_returned_to_outbox_with_backoff(self):
        event = self.store.enqueue_account_monitor_event(
            registration_id=self.registration_id,
            email="monitor@example.com",
            bot_risk=False,
            bfs="",
            occurred_at="2026-08-11T12:00:00Z",
        )
        claimed = self.store.claim_account_monitor_delivery()
        notifier = AccountMonitorNotifier()
        notifier._repository = self.store
        session = FakeSession(FakeResponse(status_code=503, text="unavailable"))

        with mock.patch(
            "backend.integrations.account_monitor.requests.Session",
            return_value=session,
        ):
            notifier._deliver(
                claimed,
                {
                    "url": "http://monitor.test/account-imported",
                    "token": "shared-token",
                    "timeout": 10,
                },
            )

        delivery = self.store.account_monitor_deliveries([self.registration_id])[self.registration_id]
        self.assertEqual(delivery["event_id"], event["event_id"])
        self.assertEqual(delivery["status"], "pending")
        self.assertEqual(delivery["attempts"], 1)
        self.assertIn("HTTP 503", delivery["last_error"])
        self.assertGreater(delivery["next_attempt_at"], time.time())

    def test_successful_webhook_marks_claimed_event_delivered(self):
        event = self.store.enqueue_account_monitor_event(
            registration_id=self.registration_id,
            email="monitor@example.com",
            bot_risk=False,
            bfs="",
            occurred_at="2026-08-11T12:00:00Z",
        )
        claimed = self.store.claim_account_monitor_delivery()
        session = FakeSession()
        notifier = AccountMonitorNotifier()
        notifier._repository = self.store

        with mock.patch(
            "backend.integrations.account_monitor.requests.Session",
            return_value=session,
        ):
            notifier._deliver(
                claimed,
                {
                    "url": "http://monitor.test/account-imported",
                    "token": "shared-token",
                    "timeout": 10,
                },
            )

        self.assertEqual(len(session.calls), 1)
        url, request = session.calls[0]
        self.assertEqual(url, "http://monitor.test/account-imported")
        self.assertEqual(request["headers"]["x-monitor-token"], "shared-token")
        self.assertEqual(request["json"]["event_id"], event["event_id"])
        delivery = self.store.account_monitor_deliveries([self.registration_id])[self.registration_id]
        self.assertEqual(delivery["status"], "delivered")


if __name__ == "__main__":
    unittest.main()

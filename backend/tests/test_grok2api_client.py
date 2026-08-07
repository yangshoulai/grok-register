import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend.integrations import grok2api_client
from backend.integrations.grok2api_client import Grok2APIClient, Grok2APIImportError


class FakeResponse:
    def __init__(self, status=200, payload=None, lines=None):
        self.status_code = status
        self._payload = payload
        self._lines = lines or []
        self.closed = False

    def json(self):
        return self._payload

    def iter_lines(self):
        return iter(self._lines)

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.closed = False

    def post(self, url, **kwargs):
        self.calls.append((url, dict(kwargs)))
        return self.responses.pop(0)

    def get(self, url, **kwargs):
        self.calls.append((url, dict(kwargs)))
        return self.responses.pop(0)

    def delete(self, url, **kwargs):
        self.calls.append((url, dict(kwargs)))
        return self.responses.pop(0)

    def close(self):
        self.closed = True


class Grok2APIClientTests(unittest.TestCase):
    def test_owned_session_does_not_inherit_environment_proxy(self):
        session = mock.Mock()
        with mock.patch.object(
            grok2api_client.requests,
            "Session",
            return_value=session,
        ) as factory:
            client = Grok2APIClient("https://example.test", "admin", "secret")
        factory.assert_called_once_with(trust_env=False)
        self.assertIs(client.session, session)

    def test_from_config_validates_and_builds_client(self):
        config = {
            "grok2api_remote_url": "https://example.test/",
            "grok2api_remote_username": "admin",
            "grok2api_remote_password": "secret",
        }
        self.assertTrue(Grok2APIClient.is_configured(config))
        client = Grok2APIClient.from_config(config, session=FakeSession([]))
        self.assertEqual(client.base_url, "https://example.test")
        self.assertEqual(client.username, "admin")

    def test_login_caches_access_token_on_instance(self):
        session = FakeSession(
            [FakeResponse(payload={"data": {"tokens": {"accessToken": "fresh-token"}}})]
        )
        client = Grok2APIClient(
            "https://example.test/", "admin", "secret", session=session
        )
        self.assertEqual(client.login(), "fresh-token")
        self.assertEqual(client.login(), "fresh-token")
        self.assertEqual(client.access_token, "fresh-token")
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(
            session.calls[0][0], "https://example.test/api/admin/v1/auth/login"
        )

    def test_import_logs_in_uses_multipart_and_parses_complete_event(self):
        import_response = FakeResponse(
            lines=[
                b": connected",
                b"",
                b"event: progress",
                b'data: {"completed":1,"total":1}',
                b"",
                b"event: complete",
                b'data: {"created":1,"updated":0,"synced":1}',
                b"",
            ]
        )
        session = FakeSession(
            [
                FakeResponse(payload={"data": {"tokens": {"accessToken": "fresh-token"}}}),
                import_response,
            ]
        )
        client = Grok2APIClient(
            "https://example.test", "admin", "secret", session=session
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "g2a-fixture.json"
            path.write_text(json.dumps({"provider": "grok_build"}), encoding="utf-8")
            result = client.import_auth_file(path)
        self.assertEqual(result["created"], 1)
        self.assertIn("multipart", session.calls[1][1])
        self.assertEqual(
            session.calls[1][1]["headers"]["Authorization"], "Bearer fresh-token"
        )
        self.assertTrue(import_response.closed)

    def test_import_surfaces_sse_error(self):
        session = FakeSession(
            [
                FakeResponse(payload={"data": {"tokens": {"accessToken": "fresh-token"}}}),
                FakeResponse(
                    lines=[
                        b"event: error",
                        b'data: {"message":"fixture failed"}',
                        b"",
                    ]
                ),
            ]
        )
        client = Grok2APIClient(
            "https://example.test", "admin", "secret", session=session
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "g2a-fixture.json"
            path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(Grok2APIImportError, "fixture failed"):
                client.import_auth_file(path)

    def test_delete_web_sso_accounts_queries_and_deletes_all_matches(self):
        search_response = FakeResponse(
            payload={
                "data": {
                    "items": [
                        {"id": "385", "email": "fixture@example.com"},
                        {"id": "386", "email": "fixture@example.com"},
                    ],
                    "total": 2,
                }
            }
        )
        delete_response_one = FakeResponse(payload={"data": {"deleted": 1}})
        delete_response_two = FakeResponse(payload={"data": {"deleted": 1}})
        session = FakeSession(
            [
                FakeResponse(
                    payload={"data": {"tokens": {"accessToken": "fresh-token"}}}
                ),
                search_response,
                delete_response_one,
                delete_response_two,
            ]
        )
        client = Grok2APIClient(
            "https://example.test", "admin", "secret", session=session
        )

        result = client.delete_web_sso_accounts("fixture@example.com")

        self.assertEqual(result["ids"], ["385", "386"])
        self.assertEqual(
            session.calls[1][0], "https://example.test/api/admin/v1/accounts"
        )
        self.assertEqual(
            session.calls[1][1]["params"],
            {
                "page": 1,
                "pageSize": 20,
                "search": "fixture@example.com",
                "sortBy": "createdAt",
                "sortOrder": "desc",
                "provider": "grok_web",
            },
        )
        self.assertEqual(
            session.calls[2][0], "https://example.test/api/admin/v1/accounts/385"
        )
        self.assertEqual(
            session.calls[2][1]["json"],
            {
                "provider": "grok_web",
                "linkedDeleteTargets": ["grok_console", "grok_build"],
            },
        )
        self.assertEqual(
            session.calls[3][0], "https://example.test/api/admin/v1/accounts/386"
        )
        self.assertTrue(search_response.closed)
        self.assertTrue(delete_response_one.closed)
        self.assertTrue(delete_response_two.closed)

    def test_context_manager_closes_owned_session_only(self):
        external = FakeSession([])
        client = Grok2APIClient(
            "https://example.test", "admin", "secret", session=external
        )
        client.close()
        self.assertFalse(external.closed)


if __name__ == "__main__":
    unittest.main()

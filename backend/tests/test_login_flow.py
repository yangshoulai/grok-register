import unittest
from unittest import mock

from backend.registration import login_flow


class _Page:
    def __init__(self, error=None):
        self.error = error
        self.url = "https://accounts.x.ai/sign-in"
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.error:
            raise self.error


class LoginNavigationTests(unittest.TestCase):
    def test_navigation_waits_only_for_dom_content(self):
        page = _Page()
        with (
            mock.patch.object(login_flow, "_active_or_new_page", return_value=page),
            mock.patch.object(
                login_flow,
                "_wait_for_signin_page",
                return_value={
                    "url": page.url,
                    "ready": True,
                    "region_blocked": False,
                    "text": "Log into your account",
                },
            ),
        ):
            login_flow._navigate_signin()

        self.assertEqual(
            page.calls,
            [
                (
                    login_flow.SIGNIN_URL,
                    {
                        "wait_until": "domcontentloaded",
                        "timeout": login_flow.SIGNIN_NAVIGATION_TIMEOUT_MS,
                    },
                )
            ],
        )

    def test_navigation_timeout_is_soft_when_login_ui_is_ready(self):
        page = _Page(TimeoutError("fixture load timeout"))
        logs = []
        with (
            mock.patch.object(login_flow, "_active_or_new_page", return_value=page),
            mock.patch.object(
                login_flow,
                "_wait_for_signin_page",
                return_value={
                    "url": page.url,
                    "ready": True,
                    "region_blocked": False,
                    "text": "Log into your account",
                },
            ),
        ):
            login_flow._navigate_signin(log_callback=logs.append)

        self.assertTrue(any("登录控件已经可用" in message for message in logs))

    def test_region_block_restarts_browser_and_recovers(self):
        first = _Page()
        second = _Page()
        logs = []
        states = [
            {
                "url": first.url,
                "ready": False,
                "region_blocked": True,
                "text": "This service is not available in your region.",
            },
            {
                "url": second.url,
                "ready": True,
                "region_blocked": False,
                "text": "Log into your account",
            },
        ]
        with (
            mock.patch.object(
                login_flow,
                "_active_or_new_page",
                side_effect=[first, second],
            ) as acquire,
            mock.patch.object(
                login_flow,
                "_wait_for_signin_page",
                side_effect=states,
            ),
        ):
            login_flow._navigate_signin(log_callback=logs.append)

        self.assertFalse(acquire.call_args_list[0].kwargs["restart"])
        self.assertTrue(acquire.call_args_list[1].kwargs["restart"])
        self.assertTrue(any("代理出口地区不可用" in message for message in logs))

    def test_repeated_region_block_reports_specific_reason(self):
        page = _Page()
        state = {
            "url": page.url,
            "ready": False,
            "region_blocked": True,
            "text": "This service is not available in your region.",
        }
        with (
            mock.patch.object(login_flow, "SIGNIN_NAVIGATION_ATTEMPTS", 2),
            mock.patch.object(login_flow, "_active_or_new_page", return_value=page),
            mock.patch.object(login_flow, "_wait_for_signin_page", return_value=state),
        ):
            with self.assertRaisesRegex(RuntimeError, "代理出口地区不可用"):
                login_flow._navigate_signin()


class LoginFormTests(unittest.TestCase):
    def test_password_field_retry_uses_explicit_kind(self):
        locator = mock.Mock()
        locator.input_value.return_value = ""
        element = mock.Mock(_raw=locator)
        fresh_locator = mock.Mock()
        fresh_locator.input_value.return_value = "fixture@password"
        fresh = mock.Mock(_raw=fresh_locator)

        with mock.patch.object(
            login_flow,
            "_native_input_candidates",
            return_value=[fresh],
        ) as candidates:
            self.assertTrue(
                login_flow._type_login_value(
                    element,
                    "fixture@password",
                    kind="password",
                )
            )

        candidates.assert_called_once_with("password")

    def test_existing_email_form_is_resumed_without_clicking_entry_button(self):
        email_input = mock.Mock()
        password_input = mock.Mock()
        active = mock.Mock(url="https://grok.com/")

        def inputs(kind):
            return [email_input] if kind == "email" else [password_input]

        with (
            mock.patch.object(login_flow, "_navigate_signin"),
            mock.patch.object(login_flow, "_dismiss_cookie_consent"),
            mock.patch.object(login_flow, "_native_input_candidates", side_effect=inputs),
            mock.patch.object(login_flow, "_native_click_action") as entry_click,
            mock.patch.object(login_flow, "_type_login_value", return_value=True),
            mock.patch.object(login_flow, "_click_submit", return_value=True),
            mock.patch.object(login_flow, "_try_sync_turnstile", return_value=True),
            mock.patch.object(login_flow, "_visible_login_error", return_value=""),
            mock.patch.object(login_flow, "active_page", return_value=active),
            mock.patch.object(login_flow, "_wait_for_login_sso", return_value="sso-value"),
            mock.patch.object(login_flow.time, "sleep"),
        ):
            token = login_flow.login_with_password(
                "fixture@example.com",
                "fixture-password",
            )

        self.assertEqual(token, "sso-value")
        entry_click.assert_not_called()


if __name__ == "__main__":
    unittest.main()

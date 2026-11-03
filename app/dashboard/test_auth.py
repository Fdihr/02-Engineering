import sys
import unittest
from unittest.mock import patch

from dashboard.auth import EntraSignInError, authenticate


class FakeApplication:
    def __init__(self, result):
        self.result = result

    def acquire_token_interactive(self, **kwargs):
        self.options = kwargs
        return self.result


class FakeMsal:
    exceptions = type("Exceptions", (), {"MsalError": RuntimeError})

    def __init__(self, result):
        self.result = result
        self.application = None

    def PublicClientApplication(self, client_id, authority):
        self.application = FakeApplication(self.result)
        self.client_id = client_id
        self.authority = authority
        return self.application


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tenant = "12345678-1234-1234-1234-123456789012"
        self.client = "abcdef12-3456-7890-abcd-ef1234567890"
        self.claims = {
            "tid": self.tenant,
            "oid": "fedcba98-7654-3210-fedc-ba9876543210",
            "preferred_username": "analyst@example.com",
            "name": "Example Analyst",
        }

    def test_interactive_sign_in_returns_only_tenant_identity(self):
        fake = FakeMsal({"id_token_claims": self.claims, "access_token": "do-not-return"})
        with patch.dict(sys.modules, {"msal": fake}):
            user = authenticate(self.tenant, self.client)
        self.assertEqual(user["objectId"], self.claims["oid"])
        self.assertEqual(user["username"], self.claims["preferred_username"])
        self.assertNotIn("access_token", user)
        self.assertEqual(fake.authority, f"https://login.microsoftonline.com/{self.tenant}")
        self.assertEqual(fake.application.options["scopes"], ["User.Read"])

    def test_rejects_an_identity_from_another_tenant(self):
        fake = FakeMsal({"id_token_claims": {**self.claims, "tid": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}})
        with patch.dict(sys.modules, {"msal": fake}):
            with self.assertRaises(EntraSignInError):
                authenticate(self.tenant, self.client)


if __name__ == "__main__":
    unittest.main()

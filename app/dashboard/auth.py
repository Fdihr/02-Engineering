"""Microsoft Entra sign-in for the local dashboard."""
from __future__ import annotations

import re
from typing import Any


class EntraSignInError(Exception):
    """A safe, user-displayable sign-in failure."""


def authenticate(tenant_id: str, client_id: str) -> dict[str, str]:
    """Sign in with the system browser and return verified identity claims only."""
    try:
        import msal
    except ImportError as error:
        raise EntraSignInError("Install the dashboard sign-in dependency and restart the server.") from error

    try:
        application = msal.PublicClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
        )
        result: dict[str, Any] = application.acquire_token_interactive(
            scopes=["User.Read"],
            prompt="select_account",
            timeout=300,
        )
    except (msal.exceptions.MsalError, OSError, TimeoutError, ValueError, RuntimeError) as error:
        raise EntraSignInError("Microsoft sign-in could not be completed. Try again.") from error
    claims = result.get("id_token_claims")
    if not isinstance(claims, dict):
        raise EntraSignInError("Microsoft sign-in was not completed. Try again.")

    token_tenant = claims.get("tid")
    object_id = claims.get("oid")
    if (not isinstance(token_tenant, str) or token_tenant.casefold() != tenant_id.casefold()
            or not isinstance(object_id, str)
            or not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", object_id)):
        raise EntraSignInError("This account is not part of the configured Entra tenant.")

    username = claims.get("preferred_username")
    display_name = claims.get("name")
    if not isinstance(username, str) or not username.strip():
        username = object_id
    if not isinstance(display_name, str) or not display_name.strip():
        display_name = username
    return {
        "tenantId": token_tenant,
        "objectId": object_id,
        "username": username.strip(),
        "displayName": display_name.strip(),
    }

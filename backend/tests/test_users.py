"""The member directory, self-service profile changes, and administration."""

from fastapi.testclient import TestClient

from tests.conftest import DEFAULT_USERNAME, register, sign_in


def test_directory_lists_active_accounts(admin: TestClient, make_client) -> None:
    register(make_client(), "casey", displayName="Casey Jones")

    response = admin.get("/api/users")

    assert response.status_code == 200
    entries = {entry["username"]: entry for entry in response.json()}
    assert entries["casey"]["displayName"] == "Casey Jones"
    # The directory is deliberately minimal.
    assert set(entries["casey"]) == {"id", "username", "displayName"}


def test_directory_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/users").status_code == 401


def test_directory_omits_deactivated_accounts(admin: TestClient, make_client) -> None:
    created = register(make_client(), "gone")
    admin.patch(f"/api/admin/users/{created['id']}", json={"isActive": False})

    usernames = [entry["username"] for entry in admin.get("/api/users").json()]

    assert "gone" not in usernames


def test_profile_can_be_updated(client: TestClient) -> None:
    register(client, "casey")

    response = client.patch(
        "/api/users/me", json={"displayName": "Casey J", "email": "casey@example.com"}
    )

    assert response.status_code == 200
    assert response.json()["displayName"] == "Casey J"
    assert client.get("/api/auth/session").json()["email"] == "casey@example.com"


def test_blank_display_name_is_rejected(client: TestClient) -> None:
    register(client, "casey")

    response = client.patch("/api/users/me", json={"displayName": "   "})

    assert response.status_code == 422


def test_password_change_requires_the_current_password(client: TestClient) -> None:
    register(client, "casey", password="correct-horse")

    response = client.post(
        "/api/users/me/password",
        json={"currentPassword": "wrong", "newPassword": "battery-staple"},
    )

    assert response.status_code == 422


def test_password_change_revokes_every_session(client: TestClient, make_client) -> None:
    register(client, "casey", password="correct-horse")
    other = make_client()
    sign_in(other, "casey", "correct-horse")

    response = client.post(
        "/api/users/me/password",
        json={"currentPassword": "correct-horse", "newPassword": "battery-staple"},
    )

    assert response.status_code == 204
    assert other.get("/api/auth/session").status_code == 401
    assert sign_in(client, "casey", "battery-staple")["username"] == "casey"


def test_members_cannot_reach_administration(client: TestClient) -> None:
    register(client, "casey")

    assert client.get("/api/admin/users").status_code == 403
    assert client.patch("/api/admin/users/1", json={"role": "admin"}).status_code == 403
    assert client.delete("/api/admin/users/1").status_code == 403


def test_admin_lists_every_account(admin: TestClient, make_client) -> None:
    register(make_client(), "casey")

    usernames = [user["username"] for user in admin.get("/api/admin/users").json()]

    assert usernames == ["casey", DEFAULT_USERNAME]


def test_admin_can_promote_a_member(admin: TestClient, make_client) -> None:
    member = make_client()
    created = register(member, "casey")

    response = admin.patch(f"/api/admin/users/{created['id']}", json={"role": "admin"})

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert member.get("/api/admin/users").status_code == 200


def test_admin_cannot_remove_the_last_administrator(admin: TestClient) -> None:
    me = admin.get("/api/auth/session").json()

    demoted = admin.patch(f"/api/admin/users/{me['id']}", json={"role": "member"})
    deleted = admin.delete(f"/api/admin/users/{me['id']}")

    assert demoted.status_code == 422
    assert deleted.status_code == 422
    assert admin.get("/api/auth/session").json()["role"] == "admin"


def test_admin_can_step_down_once_another_administrator_exists(
    admin: TestClient, make_client
) -> None:
    created = register(make_client(), "casey")
    admin.patch(f"/api/admin/users/{created['id']}", json={"role": "admin"})
    me = admin.get("/api/auth/session").json()

    response = admin.patch(f"/api/admin/users/{me['id']}", json={"role": "member"})

    assert response.status_code == 200


def test_deleting_a_user_removes_their_boards(admin: TestClient, make_client) -> None:
    member = make_client()
    created = register(member, "casey")

    response = admin.delete(f"/api/admin/users/{created['id']}")

    assert response.status_code == 204
    assert member.get("/api/auth/session").status_code == 401
    assert [
        user["username"] for user in admin.get("/api/admin/users").json()
    ] == [DEFAULT_USERNAME]


def test_administering_an_unknown_user_is_a_404(admin: TestClient) -> None:
    assert admin.patch("/api/admin/users/9999", json={"role": "admin"}).status_code == 404
    assert admin.delete("/api/admin/users/9999").status_code == 404

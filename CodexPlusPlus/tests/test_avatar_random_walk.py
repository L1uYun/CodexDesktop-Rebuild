from __future__ import annotations

import codex_session_delete.launcher as launcher


def test_avatar_random_walk_returns_false_without_avatar_target(monkeypatch):
    monkeypatch.setattr(launcher.cdp, "list_targets", lambda port: [{"type": "page", "url": "app://-/index.html", "id": "main"}])

    assert launcher.move_avatar_window_once(19339, {}) is False


def test_avatar_random_walk_returns_false_without_avatar_websocket(monkeypatch):
    monkeypatch.setattr(
        launcher.cdp,
        "list_targets",
        lambda port: [{"type": "page", "url": "app://-/index.html?initialRoute=%2Favatar-overlay", "id": "avatar"}],
    )

    assert launcher.move_avatar_window_once(19339, {}) is False


def test_avatar_direction_uses_velocity_angle():
    assert launcher._avatar_direction_degrees(5, 0, 90) == 0
    assert launcher._avatar_direction_degrees(0, 5, 0) == 90
    assert launcher._avatar_direction_degrees(-5, 0, 0) == 180
    assert launcher._avatar_direction_degrees(0, -5, 0) == -90
    assert launcher._avatar_direction_degrees(1, 1, 45) == 45


def test_avatar_direction_sector_has_hysteresis():
    assert launcher._avatar_direction_sector(-115, 5) == 5
    assert launcher._avatar_direction_sector(-98, 5) == 6
    assert launcher._avatar_direction_sector(4, 0) == 0


def test_avatar_move_uses_official_overlay_ipc(monkeypatch):
    calls = []
    monkeypatch.setattr(launcher, "evaluate_script", lambda websocket_url, script: calls.append((websocket_url, script)))

    launcher._move_avatar_window("ws://avatar", 123, 456)

    assert calls == [
        (
            "ws://avatar",
            "window.electronBridge.sendMessageFromView({type:'avatar-overlay-auto-move',left:123,top:456});",
        )
    ]


def test_avatar_cursor_repulsion_pushes_away_from_near_cursor():
    repel_x, repel_y = launcher._avatar_cursor_repulsion(100, 100, (80, 100))

    assert repel_x > 0
    assert abs(repel_y) < 0.001


def test_avatar_cursor_repulsion_reaches_past_old_radius():
    repel_x, repel_y = launcher._avatar_cursor_repulsion(100, 100, (-100, 100))

    assert repel_x > 0
    assert abs(repel_y) < 0.001


def test_avatar_cursor_repulsion_is_not_directionally_weaker():
    horizontal_x, horizontal_y = launcher._avatar_cursor_repulsion(100, 100, (60, 100))
    vertical_x, vertical_y = launcher._avatar_cursor_repulsion(100, 100, (100, 60))

    assert abs(horizontal_x) == abs(vertical_y)
    assert abs(horizontal_y) < 0.001
    assert abs(vertical_x) < 0.001


def test_avatar_cursor_repulsion_ignores_far_cursor():
    assert launcher._avatar_cursor_repulsion(100, 100, (400, 100)) == (0.0, 0.0)


def test_avatar_random_walk_moves_avatar_target_inside_primary_work_area(monkeypatch):
    calls = []
    times = iter([10.0, 10.12])
    monkeypatch.setattr(
        launcher.cdp,
        "list_targets",
        lambda port: [{"type": "page", "url": "app://-/index.html?initialRoute=%2Favatar-overlay", "id": "avatar", "webSocketDebuggerUrl": "ws://avatar"}],
    )
    monkeypatch.setattr(
        launcher,
        "_windows_monitors",
        lambda: [{"rect": (0, 0, 1920, 1080), "work": (0, 0, 1920, 1040), "primary": True}],
    )
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.random, "uniform", lambda start, end: 0.0 if start < 0 else 50.0)
    monkeypatch.setattr(launcher, "_cursor_position", lambda: None)
    monkeypatch.setattr(launcher, "_avatar_window_bounds", lambda websocket_url: {"left": 100, "top": 100, "width": 356, "height": 320})
    monkeypatch.setattr(launcher, "_move_avatar_window", lambda websocket_url, left, top: calls.append((websocket_url, left, top)))
    monkeypatch.setattr(launcher, "_set_avatar_walk_direction", lambda websocket_url, direction: calls.append(("direction", websocket_url, direction)))

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True
    move_calls = [call for call in calls if call[0] == "ws://avatar"]
    direction_calls = [call for call in calls if call[0] == "direction"]
    assert 100 < move_calls[-1][1] < 180
    assert 0 <= move_calls[-1][2] <= 720
    assert direction_calls[-1][2] == 0


def test_avatar_random_walk_targets_primary_when_dragged_to_secondary(monkeypatch):
    calls = []
    tick = {"value": 10.0}
    window = {"left": 2200, "top": 100}
    monkeypatch.setattr(
        launcher.cdp,
        "list_targets",
        lambda port: [{"type": "page", "url": "app://-/index.html?initialRoute=%2Favatar-overlay", "id": "avatar", "webSocketDebuggerUrl": "ws://avatar"}],
    )
    monkeypatch.setattr(
        launcher,
        "_windows_monitors",
        lambda: [
            {"rect": (0, 0, 1920, 1080), "work": (0, 0, 1920, 1040), "primary": True},
            {"rect": (1920, 0, 3840, 1080), "work": (1920, 0, 3840, 1040), "primary": False},
        ],
    )
    monkeypatch.setattr(launcher.time, "monotonic", lambda: tick["value"])
    monkeypatch.setattr(launcher.random, "uniform", lambda start, end: 0.0 if start < 0 else 50.0)
    monkeypatch.setattr(launcher, "_cursor_position", lambda: None)
    monkeypatch.setattr(
        launcher,
        "_avatar_window_bounds",
        lambda websocket_url: {"left": window["left"], "top": window["top"], "width": 356, "height": 320},
    )

    def move_avatar(websocket_url, left, top):
        window["left"] = left
        window["top"] = top
        calls.append((websocket_url, left, top))

    monkeypatch.setattr(launcher, "_move_avatar_window", move_avatar)
    monkeypatch.setattr(launcher, "_set_avatar_walk_direction", lambda websocket_url, direction: calls.append(("direction", websocket_url, direction)))

    state = {}
    for _ in range(40):
        assert launcher.move_avatar_window_once(19339, state) is True
        tick["value"] += 0.12
    move_calls = [call for call in calls if call[0] == "ws://avatar"]
    direction_calls = [call for call in calls if call[0] == "direction"]
    assert move_calls[-1][1] < 1920
    assert direction_calls[-1][2] == 4


def test_avatar_random_walk_steers_away_from_cursor(monkeypatch):
    calls = []
    times = iter([10.0, 10.12])
    monkeypatch.setattr(
        launcher.cdp,
        "list_targets",
        lambda port: [{"type": "page", "url": "app://-/index.html?initialRoute=%2Favatar-overlay", "id": "avatar", "webSocketDebuggerUrl": "ws://avatar"}],
    )
    monkeypatch.setattr(
        launcher,
        "_windows_monitors",
        lambda: [{"rect": (0, 0, 1920, 1080), "work": (0, 0, 1920, 1040), "primary": True}],
    )
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.random, "uniform", lambda start, end: 0.0 if start < 0 else 16.0)
    monkeypatch.setattr(launcher, "_avatar_window_bounds", lambda websocket_url: {"left": 300, "top": 300, "width": 100, "height": 100})
    monkeypatch.setattr(launcher, "_cursor_position", lambda: (300, 350))
    monkeypatch.setattr(launcher, "_move_avatar_window", lambda websocket_url, left, top: calls.append((websocket_url, left, top)))
    monkeypatch.setattr(launcher, "_set_avatar_walk_direction", lambda websocket_url, direction: None)

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True

    assert calls[-1][1] > 300


def test_avatar_random_walk_uses_actual_avatar_center_for_cursor_repulsion(monkeypatch):
    calls = []
    times = iter([10.0, 10.12])
    monkeypatch.setattr(
        launcher.cdp,
        "list_targets",
        lambda port: [{"type": "page", "url": "app://-/index.html?initialRoute=%2Favatar-overlay", "id": "avatar", "webSocketDebuggerUrl": "ws://avatar"}],
    )
    monkeypatch.setattr(
        launcher,
        "_windows_monitors",
        lambda: [{"rect": (0, 0, 1920, 1080), "work": (0, 0, 1920, 1040), "primary": True}],
    )
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.random, "uniform", lambda start, end: 0.0 if start < 0 else 16.0)
    monkeypatch.setattr(
        launcher,
        "_avatar_window_bounds",
        lambda websocket_url: {"left": 100, "top": 100, "width": 356, "height": 320, "avatar_center_x": 366, "avatar_center_y": 209},
    )
    monkeypatch.setattr(launcher, "_cursor_position", lambda: (330, 209))
    monkeypatch.setattr(launcher, "_move_avatar_window", lambda websocket_url, left, top: calls.append((websocket_url, left, top)))
    monkeypatch.setattr(launcher, "_set_avatar_walk_direction", lambda websocket_url, direction: None)

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True

    assert calls[-1][1] > 100

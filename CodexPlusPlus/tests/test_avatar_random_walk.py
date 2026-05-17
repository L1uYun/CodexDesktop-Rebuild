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
    assert direction_calls[-1] == ("direction", "ws://avatar", 1)


def test_avatar_random_walk_targets_primary_when_dragged_to_secondary(monkeypatch):
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
        lambda: [
            {"rect": (0, 0, 1920, 1080), "work": (0, 0, 1920, 1040), "primary": True},
            {"rect": (1920, 0, 3840, 1080), "work": (1920, 0, 3840, 1040), "primary": False},
        ],
    )
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.random, "uniform", lambda start, end: 0.0 if start < 0 else 50.0)
    monkeypatch.setattr(launcher, "_avatar_window_bounds", lambda websocket_url: {"left": 2200, "top": 100, "width": 356, "height": 320})
    monkeypatch.setattr(launcher, "_move_avatar_window", lambda websocket_url, left, top: calls.append((websocket_url, left, top)))
    monkeypatch.setattr(launcher, "_set_avatar_walk_direction", lambda websocket_url, direction: calls.append(("direction", websocket_url, direction)))

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True
    move_calls = [call for call in calls if call[0] == "ws://avatar"]
    direction_calls = [call for call in calls if call[0] == "direction"]
    assert move_calls[-1][1] < 2200
    assert direction_calls[-1] == ("direction", "ws://avatar", -1)

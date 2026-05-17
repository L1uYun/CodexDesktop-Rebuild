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

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True
    assert calls[-1][0] == "ws://avatar"
    assert 100 < calls[-1][1] < 180
    assert 0 <= calls[-1][2] <= 720


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

    state = {}
    assert launcher.move_avatar_window_once(19339, state) is True
    assert launcher.move_avatar_window_once(19339, state) is True
    assert calls[-1][0] == "ws://avatar"
    assert calls[-1][1] < 2200

from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_walk_runs_from_main_process():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==6" in text
    assert "avatar-main-walk-started" in text
    assert "M.avatarOverlayManager.autoMove" in text
    assert "window.__codexAvatarWalkDirection" in text
    assert "c.id!==l.id||k>=70" in text
    assert "k>.001&&p-e.near>=900" in text
    assert "u=l.workArea" in text
    assert "h=Math.max(-80,Math.min(80,rx/10))" in text

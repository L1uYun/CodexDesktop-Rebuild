from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_walk_runs_from_main_process():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==7" in text
    assert "avatar-main-walk-started" in text
    assert "M.avatarOverlayManager.autoMove" in text
    assert "window.__codexAvatarWalkDirection" in text
    assert "M.avatarOverlayManager.getLayout(r).mascot" in text
    assert "u.id!==d.id||j>=70" in text
    assert "j>.001&&h-e.near>=900" in text
    assert "p=d.workArea" in text
    assert "_=Math.max(-80,Math.min(80,rx/10))" in text
    assert "Math.round(e.x-a.left)" in text

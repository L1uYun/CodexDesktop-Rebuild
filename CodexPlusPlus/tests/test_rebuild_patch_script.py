from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_walk_runs_from_main_process():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==11" in text
    assert "avatar-main-walk-started" in text
    assert "M.avatarOverlayManager.autoMove" in text
    assert "window.__codexAvatarWalkDirection" in text
    assert "M.avatarOverlayManager.getLayout(i).mascot" in text
    assert "Math.exp(-.75*g)" in text
    assert "d.id!==p.id||k>=70" in text
    assert "k>.001&&h-e.near>=900" in text
    assert "C+=(Math.random()-.5)*34" in text
    assert "e.vx=n/i*115" in text
    assert "p.id===d.id&&(C+=(Math.random()-.5)*34" in text
    assert "p.id!==d.id?130:38" in text
    assert "Math.round(e.x-o.left)" in text
    assert "t+a.mascot.left" in text
    assert "n.screen.getDisplayNearestPoint(FU(i.getBounds())).bounds" in text
    assert "n.screen.getDisplayNearestPoint(FU(o)).bounds" in text
    assert "[s,c,l].reduce" in text

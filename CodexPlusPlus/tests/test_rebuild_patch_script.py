from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_walk_runs_from_main_process():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==1" in text
    assert "CODEX_REBUILD_AVATAR_MAIN_WALK:`1`" in text
    assert "avatar-main-walk-started" in text
    assert "e.x>=t.x&&e.x<t.x+t.width" in text
    assert "M.avatarOverlayManager.autoMove" in text
    assert "window.__codexAvatarWalkDirection" in text
    assert "M.avatarOverlayManager.getLayout(i).mascot" in text
    assert "Math.exp(-.75*g)" in text
    assert "f||k>=70" in text
    assert "k>.001&&h-e.near>=900" in text
    assert "C+=(Math.random()-.5)*34" in text
    assert "e.vx=n/i*115" in text
    assert "!f&&(C+=(Math.random()-.5)*34" in text
    assert "f?130:38" in text
    assert "Math.round(e.x-o.left)" in text
    assert "t+a.mascot.left" in text
    assert "n.screen.getDisplayNearestPoint(FU(i.getBounds())).bounds" in text
    assert "n.screen.getDisplayNearestPoint(FU(o)).bounds" in text
    assert "[s,c,l].reduce" in text
    assert "home:0,from:0" in text
    assert "e.from=d.id" in text
    assert "c.find(t=>t.id===e.from)||d" in text
    assert "s.x+s.width<=t.x+t.width-24" in text

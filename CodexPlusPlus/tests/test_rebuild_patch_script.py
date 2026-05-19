from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_patch_opens_overlay_but_leaves_motion_to_plusplus():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==1" in text
    assert "CODEX_REBUILD_AVATAR_MAIN_WALK:`1`" not in text
    assert "avatar-main-walk-started" not in text
    assert "window.__codexAvatarWalkDirection" not in text
    assert "M.avatarOverlayManager.getLayout(i).mascot" not in text
    assert "setInterval(i,45)" not in text
    assert "mode=`watch`" not in text
    assert "mode=`curious`" not in text
    assert "mode=`threat`" not in text
    assert "mode=`tired`" not in text
    assert "mode=`wall`" not in text
    assert "lastK:999" not in text
    assert "nudge:0" not in text
    assert "e.lastK-k>24" not in text
    assert "h>e.nudge&&k>88&&k<150" not in text
    assert "e.nudge=h+3200" not in text
    assert "C=-D/k*18,w=-O/k*14" not in text
    assert "e.near&&h-e.near<520" not in text
    assert "e.near&&h-e.near>=520" not in text
    assert "k>170&&k<310" not in text
    assert "n>22000" not in text
    assert "e.mode===`creep`" not in text
    assert "target:0" not in text
    assert "e.target!==p.id&&(e.target=p.id)" not in text
    assert "let z=c.find(t=>t.id===e.target)||p" not in text
    assert "z.workArea" not in text
    assert "window.__codexAvatarMotionMode" not in text
    assert "window.__codexAvatarMotionIntensity" not in text
    assert "G={x:s.x-96,y:s.y-96,width:s.width+192,height:s.height+192}" not in text
    assert "A=c.map(e=>e.workArea).filter(e=>V(G,e))" not in text
    assert "A.length>1?U(A):d.workArea" not in text
    assert "avatar-boundary" not in text
    assert "e.mode===`startle`?1:e.mode===`retreat`?.78" not in text
    assert "C+=(Math.random()-.5)*34" not in text
    assert "!f&&(C+=(Math.random()-.5)*34" not in text
    assert "p.id===d.id&&(C+=(Math.random()-.5)*34" not in text
    assert "Math.round(e.x-o.left)" not in text
    assert "t+a.mascot.left" in text
    assert "width:a.mascot.width,height:a.mascot.height" in text
    assert "const methodPatch = \"autoMove(e,t,r)" in text
    assert "text.replaceAll(previousMethodPatch, \"\")" in text
    assert "n.screen.getDisplayNearestPoint(FU(i.getBounds())).bounds" in text
    assert "n.screen.getAllDisplays().map(e=>e.bounds).filter" in text
    assert "this.anchor.x+this.anchor.width<=e.x" in text
    assert "o.x+o.width<=e.x" in text
    assert "[s,c,...l].reduce" in text
    assert "home:0,from:0,target:0" not in text
    assert "e.from||(e.from=d.id)" not in text
    assert "if(S){e.x=s.x,e.y=s.y;if(e.home){}else{e.vx=0,e.vy=0,e.mode=`freeze`" not in text
    assert "let t=z.workArea,a=t.x+32" not in text
    assert "t.x+t.width-s.width-32" not in text
    assert "let Q=e.x!==R,Y=e.y!==N" not in text
    assert "Q&&(e.vx=0,f||" not in text
    assert "Y&&(e.vy=0,f||" not in text
    assert "s.x+s.width<=t.x+t.width-24" not in text

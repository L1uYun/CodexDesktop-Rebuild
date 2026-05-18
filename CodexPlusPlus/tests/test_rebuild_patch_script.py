from __future__ import annotations

from pathlib import Path


def test_rebuild_avatar_walk_runs_from_main_process():
    root = Path(__file__).resolve().parents[2]
    text = (root / "scripts" / "build-from-upstream.js").read_text(encoding="utf-8")

    assert "__codexRebuildAvatarAutoOpenVersion!==1" in text
    assert "CODEX_REBUILD_AVATAR_MAIN_WALK:`1`" in text
    assert "avatar-main-walk-started" in text
    assert "e.x>=t.x&&e.x<t.x+t.width" in text
    assert "i.setContentBounds({x:I,y:L,width:a.width,height:a.height},!1)" in text
    assert "M.avatarOverlayManager.anchor={x:e.x,y:e.y,width:s.width,height:s.height}" in text
    assert "window.__codexAvatarWalkDirection" in text
    assert "M.avatarOverlayManager.getLayout(i).mascot" in text
    assert "mode:`rest`" in text
    assert "amp:0" in text
    assert "mode=`probe`" in text
    assert "mode=`creep`" in text
    assert "mode=`retreat`" in text
    assert "mode=`home`" in text
    assert "mode=`startle`" in text
    assert "mode=`pounce`" in text
    assert "mode=`freeze`" in text
    assert "mode=`watch`" not in text
    assert "mode=`curious`" not in text
    assert "mode=`threat`" not in text
    assert "mode=`tired`" not in text
    assert "mode=`wall`" not in text
    assert "lastK:999" in text
    assert "pounce:0" in text
    assert "e.lastK-k>24" in text
    assert "h>e.pounce&&k>68&&k<132" in text
    assert "e.near&&h-e.near<520" in text
    assert "e.near&&h-e.near>=520" in text
    assert "k>170&&k<310" not in text
    assert "n>22000" in text
    assert "e.mode===`creep`" in text
    assert "target:0" in text
    assert "e.target!==p.id&&(e.target=p.id)" in text
    assert "let z=c.find(t=>t.id===e.target)||p" in text
    assert "z.workArea" in text
    assert "window.__codexAvatarMotionMode" in text
    assert "window.__codexAvatarMotionIntensity" in text
    assert "G={x:s.x-96,y:s.y-96,width:s.width+192,height:s.height+192}" in text
    assert "A=c.map(e=>e.workArea).filter(e=>V(G,e))" in text
    assert "A.length>1?U(A):d.workArea" in text
    assert "avatar-boundary" not in text
    assert "e.mode===`startle`?1:e.mode===`pounce`?.92:e.mode===`retreat`?.78" in text
    assert "C+=(Math.random()-.5)*34" not in text
    assert "!f&&(C+=(Math.random()-.5)*34" not in text
    assert "p.id===d.id&&(C+=(Math.random()-.5)*34" not in text
    assert "Math.round(e.x-o.left)" in text
    assert "t+a.mascot.left" in text
    assert "width:a.mascot.width,height:a.mascot.height" in text
    assert "const methodPatch = \"autoMove(e,t,r)" in text
    assert "text.replaceAll(previousMethodPatch, \"\")" in text
    assert "n.screen.getDisplayNearestPoint(FU(i.getBounds())).bounds" in text
    assert "n.screen.getAllDisplays().map(e=>e.bounds).filter" in text
    assert "this.anchor.x+this.anchor.width<=e.x" in text
    assert "o.x+o.width<=e.x" in text
    assert "[s,c,...l].reduce" in text
    assert "home:0,from:0,target:0" in text
    assert "e.from||(e.from=d.id)" in text
    assert "if(S){e.x=s.x,e.y=s.y;if(e.home){}else{e.vx=0,e.vy=0,e.mode=`freeze`" in text
    assert "let t=z.workArea,a=t.x+32" in text
    assert "t.x+t.width-s.width-32" in text
    assert "let Q=e.x!==R,Y=e.y!==N" in text
    assert "Q&&(e.vx=0,f||" in text
    assert "Y&&(e.vy=0,f||" in text
    assert "s.x+s.width<=t.x+t.width-24" in text

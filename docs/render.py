"""Render the featured image and the demo video for Q-Cert with Pillow and ffmpeg.

  python3 docs/render.py image                  -> docs/featured-image.png (1920x1080)
  python3 docs/render.py video demo-output/     -> docs/q-cert-demo.mp4 (caption slides + real terminal output)

The video shows real command output saved by the operator in demo-output/
(01-issue.txt, 02-verify-valid.txt, 03-verify-tampered.txt, 04-explorer-note.txt is optional).
It has no voice-over: every slide carries a short caption.
"""
import subprocess, sys, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG, FG, DIM, ACC, OK, BAD = (11, 15, 25), (232, 236, 244), (140, 150, 170), (120, 170, 255), (90, 210, 140), (255, 110, 110)
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANSB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
f = lambda p, s: ImageFont.truetype(p, s)

def canvas():
    im = Image.new("RGB", (W, H), BG)
    return im, ImageDraw.Draw(im)

def image(path="docs/featured-image.png"):
    im, d = canvas()
    d.text((120, 150), "Q-Cert", font=f(SANSB, 170), fill=FG)
    d.text((124, 360), "Certificates that stay valid after Q-Day", font=f(SANS, 54), fill=ACC)
    d.text((124, 450), "Issued with a hybrid signature on the QoreChain testnet", font=f(SANS, 36), fill=DIM)
    # two signature boxes
    for i, (label, sub) in enumerate([("secp256k1", "classical"), ("ML-DSA-87", "post-quantum")]):
        x = 124 + i * 600
        d.rounded_rectangle((x, 640, x + 470, 800), radius=18, outline=ACC, width=4)
        d.text((x + 36, 668), label, font=f(SANSB, 52), fill=FG)
        d.text((x + 36, 740), sub, font=f(SANS, 34), fill=DIM)
    d.text((622, 676), "+", font=f(SANSB, 90), fill=ACC)
    d.text((124, 900), "Both must verify.  Testnet only.  MIT licence.", font=f(SANS, 36), fill=FG)
    d.text((124, 980), "Build Before Q-Day  |  Quantum Pass", font=f(SANS, 30), fill=DIM)
    Path(path).parent.mkdir(exist_ok=True)
    im.save(path)
    print("wrote", path)

def caption_slide(title, lines, seconds):
    im, d = canvas()
    d.text((120, 120), title, font=f(SANSB, 72), fill=FG)
    y = 300
    for ln in lines:
        for w in textwrap.wrap(ln, 62):
            d.text((120, y), w, font=f(SANS, 46), fill=ACC if ln.startswith("*") else FG)
            y += 70
        y += 24
    return im, seconds

def terminal_slide(caption, text, seconds):
    im, d = canvas()
    d.text((80, 40), caption, font=f(SANSB, 46), fill=ACC)
    d.rounded_rectangle((60, 130, W - 60, H - 50), radius=14, fill=(5, 7, 12), outline=(40, 48, 66), width=2)
    font = f(MONO, 26)
    y = 160
    for raw in text.splitlines():
        for ln in textwrap.wrap(raw, 112) or [""]:
            col = OK if ln.startswith("PASS") or ln.startswith("VALID") else BAD if ln.startswith("FAIL") or ln.startswith("INVALID") else FG
            d.text((90, y), ln, font=font, fill=col)
            y += 36
            if y > H - 90:
                break
    return im, seconds

def video(folder, out="docs/q-cert-demo.mp4"):
    folder = Path(folder)
    rd = lambda n: (folder / n).read_text() if (folder / n).exists() else None
    slides = [
        caption_slide("Q-Cert", ["Issue and verify certificates on the QoreChain testnet.", "*A certificate signed with one classical key could be forged if that key is broken later."], 14),
        caption_slide("The idea", ["Every certificate is anchored by a hybrid-signed transaction: secp256k1 + ML-DSA-87.", "Its SHA-256 hash is stored in the transaction memo. No personal data goes on chain."], 14),
    ]
    for name, cap, sec in [
        ("01-issue.txt", "1. Issue: sign and send one hybrid transaction", 26),
        ("02-verify-valid.txt", "2. Verify: the chain checked both signatures", 30),
        ("03-verify-tampered.txt", "3. Change one word in the title and verify again", 30),
        ("04-registry.txt", "4. Optional EVM registry: lookup and revoke", 22),
    ]:
        t = rd(name)
        if t:
            slides.append(terminal_slide(cap, t, sec))
    slides.append(caption_slide("How the check works", ["verify recomputes the hash, reads the transaction from the public REST API, and checks the memo, the sender, the ML-DSA-87 extension and the chain's pqc_hybrid_verify event.", "*It does not re-run ML-DSA-87 itself."], 20))
    slides.append(caption_slide("Limits", ["Testnet only; test tokens have no value.", "Built with create-qorechain-dapp and @qorechain/sdk (credited in the README).", "*Code: MIT licence, see the repository link."], 16))
    tmp = Path("docs/_frames"); tmp.mkdir(exist_ok=True)
    listing = []
    for i, (im, sec) in enumerate(slides):
        p = tmp / f"s{i:02d}.png"; im.save(p); listing += [f"file '{p.resolve()}'", f"duration {sec}"]
    listing.append(f"file '{(tmp / f's{len(slides)-1:02d}.png').resolve()}'")
    (tmp / "list.txt").write_text("\n".join(listing))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                    "-vf", "fps=10,format=yuv420p", "-c:v", "libx264", "-crf", "24", out], check=True)
    total = sum(s for _, s in slides)
    print("wrote", out, "length", total, "s")
    assert total <= 175, "video must stay under 3 minutes"

if __name__ == "__main__":
    if sys.argv[1] == "image": image()
    else: video(sys.argv[2])

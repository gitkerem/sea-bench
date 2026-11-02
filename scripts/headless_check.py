"""Open the built bench with ?check=1 in headless Chromium and print window.__check.

    npm run build && python3 -m http.server 8123 -d dist &
    python3 scripts/headless_check.py http://127.0.0.1:8123/index.html?check=1

Needs: pip install playwright && python3 -m playwright install chromium. On a machine with a GPU the default
Chromium works; on a bare server add --use-webgpu-adapter=swiftshader (slow, and may refuse to present frames).
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/index.html?check=1"
ARGS = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] + sys.argv[2:]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, channel="chromium", args=ARGS)
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text[:600]}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {str(e)[:600]}"))
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_function("window.__check !== undefined", timeout=120000)
        print(json.dumps(await pg.evaluate("() => window.__check"), indent=1))
        for l in dict.fromkeys(logs): print(" ", l)
        await b.close()

asyncio.run(main())

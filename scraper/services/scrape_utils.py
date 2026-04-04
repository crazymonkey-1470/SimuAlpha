import asyncio
import random
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

DESKTOP_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

# Domain-level rate limiting
_last_request: dict[str, float] = {}
DOMAIN_DELAYS = {
    "stockanalysis.com": 0.8,
    "macrotrends.net": 1.2,
    "finviz.com": 0.5,
    "sec.gov": 0.1,
    "default": 0.5,
}


def _get_domain(url: str) -> str:
    return urlparse(url).netloc.replace("www.", "")


async def _rate_limit(domain: str):
    delay = DOMAIN_DELAYS.get(domain, DOMAIN_DELAYS["default"])
    last = _last_request.get(domain, 0)
    now = asyncio.get_event_loop().time()
    wait = delay - (now - last)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request[domain] = asyncio.get_event_loop().time()


async def fetch_html(url: str, needs_js: bool = False) -> str | None:
    """4-tier fallback: httpx -> curl_cffi -> Crawl4AI -> Playwright."""
    domain = _get_domain(url)
    await _rate_limit(domain)

    headers = {
        "User-Agent": random.choice(DESKTOP_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    }

    if not needs_js:
        # METHOD 1: httpx (fastest, 0.1-0.5s)
        try:
            async with httpx.AsyncClient(
                timeout=15, follow_redirects=True, headers=headers
            ) as client:
                r = await client.get(url)
                if r.status_code == 200 and len(r.text) > 500:
                    print(f"  [httpx] ✓ {domain}")
                    return r.text
        except Exception as e:
            print(f"  [httpx] ✗ {domain}: {e}")

        # METHOD 2: curl_cffi (bypasses Cloudflare, 0.3-1s)
        try:
            from curl_cffi.requests import AsyncSession

            async with AsyncSession(impersonate="chrome120") as session:
                r = await session.get(url, timeout=20)
                if r.status_code == 200 and len(r.text) > 500:
                    print(f"  [curl_cffi] ✓ {domain}")
                    return r.text
        except Exception as e:
            print(f"  [curl_cffi] ✗ {domain}: {e}")

    # METHOD 3: Crawl4AI (JS rendering, 2-5s)
    try:
        from crawl4ai import AsyncWebCrawler

        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url, bypass_cache=True)
            if result.success and result.html and len(result.html) > 500:
                print(f"  [crawl4ai] ✓ {domain}")
                return result.html
    except Exception as e:
        print(f"  [crawl4ai] ✗ {domain}: {e}")

    # METHOD 4: Playwright raw (last resort, 5-10s)
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"]
            )
            context = await browser.new_context(
                user_agent=random.choice(DESKTOP_AGENTS)
            )
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)
            html = await page.content()
            await browser.close()
            if len(html) > 500:
                print(f"  [playwright] ✓ {domain}")
                return html
    except Exception as e:
        print(f"  [playwright] ✗ {domain}: {e}")

    print(f"  [ALL METHODS FAILED] {url}")
    return None


async def fetch_json(url: str, headers: dict = None) -> dict | None:
    """Direct JSON fetch for APIs like SEC EDGAR."""
    default_headers = {
        "User-Agent": "TheLongScreener contact@example.com",
        "Accept": "application/json",
    }
    if headers:
        default_headers.update(headers)

    domain = _get_domain(url)
    await _rate_limit(domain)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=default_headers)
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        print(f"  [fetch_json] ✗ {url}: {e}")
    return None


def parse(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")

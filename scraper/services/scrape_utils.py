from curl_cffi.requests import AsyncSession as CurlSession
from crawl4ai import AsyncWebCrawler
from fake_useragent import UserAgent
from bs4 import BeautifulSoup
import httpx

ua = UserAgent()


async def fetch_html(url: str) -> str | None:
    """
    Try each method in order, return HTML on first success.
    Returns None if all methods fail.
    """
    # Import here to avoid circular dependency
    from main import rate_limit

    await rate_limit(url)

    # METHOD 1: httpx (fastest)
    try:
        headers = {"User-Agent": ua.random}
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
            if r.status_code == 200 and len(r.text) > 1000:
                return r.text
    except Exception as e:
        print(f"httpx failed for {url}: {e}")

    # METHOD 2: curl_cffi (bypasses Cloudflare)
    try:
        async with CurlSession(impersonate="chrome120") as session:
            r = await session.get(url, timeout=15)
            if r.status_code == 200 and len(r.text) > 1000:
                return r.text
    except Exception as e:
        print(f"curl_cffi failed for {url}: {e}")

    # METHOD 3: Crawl4AI (AI extraction + JS rendering)
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            if result.success and result.html:
                return result.html
    except Exception as e:
        print(f"Crawl4AI failed for {url}: {e}")

    # METHOD 4: Playwright raw (last resort)
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=30000)
            await page.wait_for_load_state("networkidle")
            html = await page.content()
            await browser.close()
            if len(html) > 1000:
                return html
    except Exception as e:
        print(f"Playwright failed for {url}: {e}")

    return None


def parse_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")

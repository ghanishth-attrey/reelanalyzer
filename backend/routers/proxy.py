"""
Image proxy router.
GET /api/proxy/instagram-thumb?url=<reel_url>

Uses Instagram's public oEmbed API to get thumbnail URL,
then serves it as a data URL since CDN URLs are IP-restricted.
"""

import httpx
import base64
import logging
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/proxy", tags=["proxy"])

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.instagram.com/",
    "Origin": "https://www.instagram.com",
    "sec-fetch-dest": "image",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "same-site",
}


@router.get("/instagram-thumb")
async def instagram_thumbnail(url: str = Query(...)):
    """
    Get Instagram reel thumbnail via oEmbed.
    Returns thumbnail as base64 data URL to bypass CDN IP restrictions.
    """
    # Step 1: get thumbnail URL from oEmbed
    thumb_url = ""
    author_name = ""
    title = ""

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.instagram.com/api/v1/oembed/",
                params={"url": url, "maxwidth": 480},
                headers={"User-Agent": BROWSER_HEADERS["User-Agent"]},
            )
            if resp.status_code == 200:
                data = resp.json()
                thumb_url = data.get("thumbnail_url", "")
                author_name = data.get("author_name", "")
                title = data.get("title", "")
    except Exception as e:
        logger.warning(f"oEmbed failed for {url}: {e}")

    if not thumb_url:
        return JSONResponse({"thumbnail_data": "", "author_name": author_name, "title": title})

    # Step 2: fetch thumbnail as bytes and return as base64 data URL
    # This bypasses IP restrictions since the request comes from the server
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            img_resp = await client.get(thumb_url, headers=BROWSER_HEADERS)
            if img_resp.status_code == 200:
                content_type = img_resp.headers.get("content-type", "image/jpeg")
                b64 = base64.b64encode(img_resp.content).decode("utf-8")
                data_url = f"data:{content_type};base64,{b64}"
                return JSONResponse({
                    "thumbnail_data": data_url,
                    "author_name": author_name,
                    "title": title,
                })
    except Exception as e:
        logger.warning(f"Thumbnail fetch failed: {e}")

    return JSONResponse({"thumbnail_data": "", "author_name": author_name, "title": title})

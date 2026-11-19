import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Notice the iframe base url:
  const billUrl = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==/bills/16d62d56-eb29-11f0-9aaa-005056a472ea';

  await page.goto(billUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  const pageHtml = await page.content();
  fs.writeFileSync('bill_detail.html', pageHtml);
  console.log("Saved bill_detail.html, size:", pageHtml.length);

  const detail = await page.evaluate(() => {
    return {
      title: document.title,
      bodyText: document.body ? document.body.innerText : '',
      tables: Array.from(document.querySelectorAll('table')).map(t => t.innerText)
    };
  });

  console.log("=== BILL DETAIL TITLE ===", detail.title);
  console.log("=== BILL DETAIL BODY TEXT ===");
  console.log(detail.bodyText.substring(0, 1500));

  await browser.close();
})();

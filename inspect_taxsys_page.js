import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const url = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==?searchCategory=property-tax&searchQuery=&searchTarget=0127152010000&searchPath=property-tax&skip=null';

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  const pageHtml = await page.content();
  fs.writeFileSync('taxsys_page.html', pageHtml);
  console.log("Saved taxsys_page.html, size:", pageHtml.length);

  const summary = await page.evaluate(() => {
    // Header
    const h1 = document.querySelector('h1')?.innerText;
    
    // Address / account details
    const accountDetails = Array.from(document.querySelectorAll('.account-detail, .account-details tr, dl dt, dl dd')).map(el => el.innerText);
    
    // Assessment Information
    const assessmentInfo = document.querySelector('#assessment-content, .assessment-info, [data-assessment]')?.innerText;
    
    // Amount due
    const amountDue = document.querySelector('#amount-due-content')?.innerText;
    
    // Bill history
    const billHistory = document.querySelector('#bill-history-content')?.innerText;

    // All links
    const links = Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(a => a.text);

    return { h1, accountDetails, assessmentInfo, amountDue, billHistory, links };
  });

  console.log("=== HEADER ===", summary.h1);
  console.log("=== AMOUNT DUE ===", summary.amountDue);
  console.log("=== BILL HISTORY ===", summary.billHistory);
  console.log("=== ASSESSMENT INFO ===", summary.assessmentInfo);
  console.log("=== LINKS ===", summary.links);

  await browser.close();
})();

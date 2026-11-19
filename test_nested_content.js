import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-gpu',
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--lang="en-US"',
      '--disable-features=HttpsFirstBalancedModeAutoEnable'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Let's test going to the nested iframe src directly
  const nestedSrc = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==?searchCategory=property-tax&searchQuery=&searchTarget=0127152010000&searchPath=property-tax&skip=null';

  console.log("Navigating directly to nestedSrc...");
  try {
    const res = await page.goto(nestedSrc, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("Status:", res?.status());
    await new Promise(r => setTimeout(r, 4000));
    console.log("Page title:", await page.title());
    console.log("URL after load:", page.url());

    const contentInfo = await page.evaluate(() => {
      const billHistory = document.querySelector('#bill-history-content');
      const amountDue = document.querySelector('#amount-due-content');
      const headerSpan = document.querySelector('h1 span[translate="no"]');
      const tables = Array.from(document.querySelectorAll('table')).length;
      return {
        hasBillHistory: !!billHistory,
        hasAmountDue: !!amountDue,
        headerText: headerSpan?.textContent?.trim(),
        tablesCount: tables,
        bodyPreview: document.body ? document.body.innerText.substring(0, 400) : ''
      };
    });
    console.log("Extracted direct info:", contentInfo);
  } catch (err) {
    console.error("Direct nav error:", err.message);
  }

  await browser.close();
})();

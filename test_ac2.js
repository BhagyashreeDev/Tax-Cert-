import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const targetSrc = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==?searchCategory=property-tax&searchQuery=&searchTarget=0127152010000&searchPath=property-tax&skip=null';

  await page.goto(targetSrc, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bill-history-content, #amount-due-content', { timeout: 30000 });

  const summary = await page.evaluate(() => {
    // 1. Bill links
    const billLinks = Array.from(document.querySelectorAll('#bill-history-content a, #amount-due-content a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(a => /\d{4}.*(?:bill|secured|annual)/i.test(a.text));

    // 2. Amount Due Section
    const amountDueSection = document.querySelector('#amount-due-content');
    const amountDueText = amountDueSection ? amountDueSection.innerText : '';

    // 3. Bill History rows
    const tbodies = Array.from(document.querySelectorAll('#bill-history-content tbody[data-bill-number]')).map(tb => {
      return {
        billNumber: tb.getAttribute('data-bill-number'),
        text: tb.innerText.replace(/\s+/g, ' ').trim(),
        className: tb.className
      };
    });

    return { billLinks, amountDueText, tbodies: tbodies.slice(0, 10) };
  });

  console.log("=== BILL LINKS ===");
  console.log(summary.billLinks);
  console.log("=== AMOUNT DUE SECTION ===");
  console.log(summary.amountDueText);
  console.log("=== TBODIES (first 10) ===");
  console.log(summary.tbodies);

  await browser.close();
})();

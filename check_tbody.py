import urllib.request
import ssl
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==?searchCategory=property-tax&searchQuery=&searchTarget=0127152010000&searchPath=property-tax&skip=null'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8', errors='ignore')

m = re.findall(r'<tbody[^>]*data-bill-number=["\'][^"\']*["\'][^>]*>.*?</tbody>', html, re.DOTALL)
for tb in m[:4]:
    print('======================')
    print(tb[:400])

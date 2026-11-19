import urllib.request
import ssl
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = 'https://gsgprod.sbcountyatc.gov/iframe-taxsys/sanbernardino-ca.county-taxes.com/govhub/property-tax/c2FuYmVybmFyZGluby1jYTpnc2d4X3Byb3BlcnR5X3RheDpwYXJlbnRzOmMxMTM5YThjLTU5YzctMTFmMC1hMmJmLWUxNTJhMDUxZGQwZA==/bills/16d62d56-eb29-11f0-9aaa-005056a472ea'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8', errors='ignore')

tables = re.findall(r'<table[^>]*>.*?</table>', html, re.DOTALL)
print(f'Found {len(tables)} tables')
for i, t in enumerate(tables):
    print(f'=== TABLE {i} ===')
    print(t[:600])

import re

with open("san_bernardino_input_page.html", "r", encoding="utf-8") as f:
    text = f.read()

print("Length:", len(text))
inputs = re.findall(r"<input[^>]*>", text)
print("Inputs found in outer HTML:", inputs)

iframes = re.findall(r"<iframe[^>]*>", text)
print("Iframes in outer HTML:")
for ifr in iframes:
    print(" -", ifr)

m = re.search(r'<div id="gsg-embedded-public-site"[^>]*>(.*?)</div>', text, re.DOTALL)
if m:
    print("Inside gsg-embedded-public-site:")
    print(m.group(0)[:500])

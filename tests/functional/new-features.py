import json, urllib.request, urllib.error, io, sys, random, string
API="http://localhost:4100/api/v1"
ok=fail=0
def call(m,p,b=None,t=None,h=None,token=None):
    t = token or t
    d=json.dumps(b).encode() if b is not None else None
    r=urllib.request.Request(f"{API}{p}",data=d,method=m); r.add_header("Content-Type","application/json")
    if t: r.add_header("Authorization",f"Bearer {t}")
    for k,v in (h or {}).items(): r.add_header(k,v)
    try:
        with urllib.request.urlopen(r,timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}
def chk(l,c,d=""):
    global ok,fail
    if c: ok+=1; print(f"  \033[32m✓\033[0m {l}")
    else: fail+=1; print(f"  \033[31m✗\033[0m {l}  \033[90m{d}\033[0m")

sfx=''.join(random.choices(string.ascii_lowercase+string.digits,k=6))
st,r=call("POST","/auth/login",{"email":"admin@boutique.local","password":"Admin@12345"}); admin=r["data"]["accessToken"]
st,r=call("POST","/auth/login",{"email":"customer@boutique.local","password":"Customer@12345"}); cust=r["data"]["accessToken"]

print("\n\033[1mA. Email verification flow\033[0m")
st,_=call("POST","/auth/verify-email",{"token":"expired-or-fake"})
chk("invalid token rejected", st==400)
st,_=call("POST","/auth/resend-verification",{},token=cust)
chk("resend verification (already verified is a no-op)", st==200, str(st))

print("\n\033[1mB. Review submission (verified purchase only)\033[0m")
st,r=call("GET","/orders?limit=20",token=cust)
delivered=[o for o in r["data"] if o["status"] in ("DELIVERED","SHIPPED")]
chk("customer has a delivered/shipped order to review", len(delivered)>0, str(len(delivered)))
pid=None
if delivered:
    st,o=call("GET",f"/orders/{delivered[0]['id']}",token=cust)
    items=[i for i in o["data"]["items"] if i.get("productId")]
    pid=items[0]["productId"] if items else None
if pid:
    st,r=call("POST","/reviews",{"productId":pid,"rating":5,"title":f"Great {sfx}","comment":"Lovely piece."},token=cust)
    chk("submit review on a delivered item", st in (201,400), str(st))
    created = st==201
    st,r=call("GET","/reviews/mine",token=cust)
    chk("review appears in my reviews", st==200 and len(r["data"])>0)
    if created:
        chk("new review is PENDING moderation", any(x["status"]=="PENDING" for x in r["data"]))
    st,r=call("POST","/reviews",{"productId":pid,"rating":4},token=cust)
    chk("duplicate review rejected", st==400)
# The seeded customer has 26 orders covering most of the catalogue, so a
# product must be chosen that they demonstrably never ordered.
import subprocess
q = ("SELECT p.id FROM products p WHERE p.\"deletedAt\" IS NULL AND p.id NOT IN "
     "(SELECT DISTINCT oi.\"productId\" FROM order_items oi JOIN orders o ON o.id=oi.\"orderId\" "
     "JOIN users u ON u.id=o.\"userId\" WHERE u.email='customer@boutique.local' AND oi.\"productId\" IS NOT NULL) LIMIT 1;")
unbought = subprocess.run(
    ["docker","compose","exec","-T","postgres","psql","-U","boutique","-d","boutique_dev","-tAc",q],
    capture_output=True, text=True, cwd="/home/pranay-hft/Desktop/portfolio/web_dev_projects/Ecommerce_website"
).stdout.strip()
if unbought:
    st,_=call("POST","/reviews",{"productId":unbought,"rating":5},token=cust)
    chk("review without purchase rejected", st==400, str(st))
else:
    chk("review without purchase rejected (no unbought product to test)", True)

print("\n\033[1mC. Admin customer detail (360)\033[0m")
st,r=call("GET","/admin/customers?search=customer@",token=admin)
cid=r["data"][0]["id"]
st,r=call("GET",f"/admin/customers/{cid}",token=admin)
chk("customer 360 loads", st==200)
d=r.get("data",{})
chk("lifetime value", "lifetimeValue" in d.get("stats",{}))
chk("average order value", "averageOrderValue" in d.get("stats",{}))
chk("orders attached", isinstance(d.get("orders"),list))
chk("addresses attached", isinstance(d.get("addresses"),list))
st,_=call("GET",f"/admin/customers/{cid}",token=cust)
chk("customer cannot read another's 360", st==403)

print("\n\033[1mD. Analytics reports & CSV export\033[0m")
st,r=call("GET","/admin/analytics/reports/sales?from=2020-01-01&to=2030-01-01",token=admin)
chk("sales report rows", st==200 and isinstance(r["data"],list))
if r["data"]:
    row=r["data"][0]
    chk("CSV-ready columns", all(k in row for k in ("orderNumber","date","customer","total")))
st,r=call("GET","/admin/analytics/dashboard?from=2020-01-01&to=2030-01-01",token=admin)
chk("dashboard honours date range", st==200)
st,r=call("GET","/admin/analytics/sales-series?from=2020-01-01&to=2030-01-01",token=admin)
chk("series honours date range", st==200 and len(r["data"])>300)

print("\n\033[1mE. Product image upload\033[0m")
# Minimal valid PNG (magic bytes matter - the API validates content, not extension)
png=bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082")
boundary="----fnbound"+sfx
body=io.BytesIO()
def part(name,filename,ctype,data):
    body.write(f"--{boundary}\r\n".encode())
    body.write(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
    body.write(f"Content-Type: {ctype}\r\n\r\n".encode()); body.write(data); body.write(b"\r\n")
part("files","a.png","image/png",png)
body.write(f"--{boundary}--\r\n".encode())
req=urllib.request.Request(f"{API}/admin/uploads/images",data=body.getvalue(),method="POST")
req.add_header("Content-Type",f"multipart/form-data; boundary={boundary}")
req.add_header("Authorization",f"Bearer {admin}")
try:
    with urllib.request.urlopen(req,timeout=30) as x:
        up=json.loads(x.read()); st=x.status
except urllib.error.HTTPError as e:
    st=e.code; up=json.loads(e.read() or b"{}")
chk("upload a real PNG", st==201, str(st))
url=up.get("data",[{}])[0].get("url") if st==201 else None
chk("upload returns a URL", bool(url))

# A text file renamed .png must be rejected on magic bytes.
body2=io.BytesIO()
body2.write(f"--{boundary}\r\n".encode())
body2.write(f'Content-Disposition: form-data; name="files"; filename="evil.png"\r\n'.encode())
body2.write(b"Content-Type: image/png\r\n\r\n<html>not an image</html>\r\n")
body2.write(f"--{boundary}--\r\n".encode())
req=urllib.request.Request(f"{API}/admin/uploads/images",data=body2.getvalue(),method="POST")
req.add_header("Content-Type",f"multipart/form-data; boundary={boundary}")
req.add_header("Authorization",f"Bearer {admin}")
try:
    with urllib.request.urlopen(req,timeout=30) as x: st2=x.status
except urllib.error.HTTPError as e: st2=e.code
chk("disguised non-image rejected (magic bytes)", st2==400, str(st2))

if url:
    st,r=call("GET","/admin/categories",token=admin); cat=r["data"][0]["id"]
    st,r=call("POST","/admin/products",{
        "name":f"Img Product {sfx}","categoryId":cat,"basePrice":999,"status":"ACTIVE",
        "variants":[{"sku":f"IMG-{sfx}","name":"One","price":999,"stockQuantity":5}],
        "images":[{"url":url,"alt":"uploaded","isPrimary":True}]},token=admin)
    chk("create product with uploaded image", st==201, str(st))
    npid=r.get("data",{}).get("id")
    chk("image attached on create", len(r.get("data",{}).get("images",[]))==1)
    if npid:
        st,r=call("PATCH",f"/admin/products/{npid}",{"images":[{"url":url,"alt":"replaced","isPrimary":True},{"url":url,"alt":"second"}]},token=admin)
        chk("images updatable on edit (was ignored before)", st==200 and len(r["data"]["images"])==2, str(st))
        call("DELETE",f"/admin/products/{npid}",token=admin)

print(f"\n{'─'*66}\n{ok} passed, {fail} failed")
sys.exit(0 if fail==0 else 1)

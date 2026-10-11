def build(pack):
    banner = str(pack.get("deploy_banner") or "").strip()
    if banner:
        print(banner)

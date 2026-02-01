import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "env"

ENV_MAPS = {
    "studio_small_01": "studio_small_01_1k.hdr",
    "kloofendal_overcast": "kloofendal_overcast_1k.hdr",
}


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "raytracer-env-downloader"})
    with urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    req = Request(url, headers={"User-Agent": "raytracer-env-downloader"})
    with urlopen(req) as resp:
        data = resp.read()
    dest.write_bytes(data)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for asset, filename in ENV_MAPS.items():
        info_url = f"https://api.polyhaven.com/files/{asset}"
        info = fetch_json(info_url)
        try:
            file_url = info["hdri"]["1k"]["hdr"]["url"]
        except KeyError as exc:
            raise RuntimeError(f"Missing HDR 1k URL for {asset}") from exc
        dest = ASSETS / filename
        print(f"Downloading {asset} -> {dest}")
        download(file_url, dest)


if __name__ == "__main__":
    main()

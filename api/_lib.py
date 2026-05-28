"""Shared model-matching logic for local FastAPI server and Vercel handler."""
import json
import os
import re
import urllib.request
from pathlib import Path


def init_secrets() -> None:
    path = Path.home() / ".secrets" / "api_keys.env"
    if path.exists():
        with open(path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k, v)


def http_get(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def fetch_hatz_models() -> list:
    key = os.environ["HATZ_API_KEY"]
    data = http_get("https://ai.hatz.ai/v1/chat/models", {"X-API-Key": key})
    return data["data"]


def fetch_aa_models() -> list:
    key = os.environ["ARTIFICIALANALYSIS_API_KEY"]
    data = http_get(
        "https://artificialanalysis.ai/api/v2/data/llms/models",
        {"x-api-key": key},
    )
    return data["data"]


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


SLUG_OVERRIDES: dict[str, str] = {
    "mistral.mixtral-8x7b-instruct-v0:1": "mixtral-8x7b-instruct",
    "anthropic.claude-haiku-4-5": "claude-4-5-haiku",
    "amazon.nova-2-lite-v1:0": "nova-2-0-omni-reasoning-medium",
}

SKIP_IDS: set[str] = {
    "auto",
    "us.meta.llama3-2-1b-instruct-v1:0",
    "us.meta.llama3-1-8b-instruct-v1:0",
    "us.meta.llama3-1-70b-instruct-v1:0",
    "us.meta.llama3-2-11b-instruct-v1:0",
    "google.gemini-3.1-flash-image-preview",
    "anthropic.claude-opus-4-5",
    "grok-2-vision-1212",
    "gemini-2-5-flash-image",
    "google.gemini-3-pro-image-preview",
}

PROVIDER_COLORS: dict[str, str] = {
    "OpenAI": "#18181b",
    "Anthropic": "#c05621",
    "Google": "#166534",
    "xAI": "#5b21b6",
    "Meta": "#1d4ed8",
    "DeepSeek": "#1e40af",
    "Amazon": "#b45309",
    "Mistral": "#b91c1c",
    "MiniMax": "#be185d",
    "NVIDIA": "#4d7c0f",
    "Qwen": "#0e7490",
    "Moonshot AI": "#0f766e",
    "GLM": "#4338ca",
    "Z AI": "#4338ca",
}


def find_aa_match(display_name: str, aa_by_slug: dict, aa_name_pairs: list):
    hatz_slug = slugify(display_name)

    m = aa_by_slug.get(hatz_slug)
    if m:
        return m

    for slug, m in aa_by_slug.items():
        if hatz_slug in slug or slug in hatz_slug:
            return m

    dl = display_name.lower()
    for aa_name, m in aa_name_pairs:
        if dl in aa_name or aa_name in dl:
            return m

    return None


def match_models(hatz_models: list, aa_models: list) -> list:
    aa_by_slug = {m["slug"]: m for m in aa_models}
    aa_name_pairs = [(m["name"].lower(), m) for m in aa_models]

    result = []
    for hm in hatz_models:
        hatz_id = hm["name"]
        if hatz_id in SKIP_IDS:
            continue

        if hatz_id in SLUG_OVERRIDES:
            aa_m = aa_by_slug.get(SLUG_OVERRIDES[hatz_id])
        else:
            aa_m = find_aa_match(hm["display_name"], aa_by_slug, aa_name_pairs)

        if not aa_m:
            continue

        evals = aa_m["evaluations"]
        pricing = aa_m["pricing"]
        intel = evals.get("artificial_analysis_intelligence_index")
        cost = pricing.get("price_1m_blended_3_to_1")

        if intel is None or cost is None:
            continue

        developer = hm["developer"]
        result.append({
            "id": hatz_id,
            "name": hm["display_name"],
            "developer": developer,
            "color": PROVIDER_COLORS.get(developer, "#71717a"),
            "max_tokens": hm["max_tokens"],
            "vision": hm.get("vision", False),
            "intelligence": intel,
            "cost_per_1m": cost,
            "cost_input": pricing.get("price_1m_input_tokens"),
            "cost_output": pricing.get("price_1m_output_tokens"),
            "speed_tps": aa_m.get("median_output_tokens_per_second"),
            "ttft": aa_m.get("median_time_to_first_token_seconds"),
            "coding_index": evals.get("artificial_analysis_coding_index"),
            "aa_name": aa_m["name"],
        })

    return sorted(result, key=lambda x: x["intelligence"], reverse=True)


def build_response() -> dict:
    init_secrets()
    hatz = fetch_hatz_models()
    aa = fetch_aa_models()
    return {"models": match_models(hatz, aa)}
